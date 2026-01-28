import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import makeDebug from "@/utils/debug";

type ProgramId = "ffmpeg" | "ffprobe";
export type CommandSource = "local" | "sidecar" | "path";

export type SpawnOptions = {
  cwd?: string;
  env?: Record<string, string>;
};

type StreamHandler = (data: string) => void;
type CloseHandler = (payload: { code: number | null; signal: number | null }) => void;
type ErrorHandler = (message: string) => void;

export type CommandStream = {
  on: (event: "data", handler: StreamHandler) => void;
};

export type CommandHandle = {
  stdout: CommandStream;
  stderr: CommandStream;
  on: (event: "close", handler: CloseHandler) => void;
  on: (event: "error", handler: ErrorHandler) => void;
};

type CommandBinder = (command: CommandHandle, source: CommandSource) => void;

const debug = makeDebug("system:shell");

const EVENTS = {
  stdout: "ffmpeg-stdout",
  stderr: "ffmpeg-stderr",
  error: "ffmpeg-error",
  close: "ffmpeg-close"
} as const;

type StreamPayload = { jobId: string; data: string };
type ErrorPayload = { jobId: string; message: string };
type ClosePayload = { jobId: string; code: number | null; signal: number | null };
type ExecuteResponse = {
  output: { code: number | null; stdout: string; stderr: string };
  source: CommandSource;
};
type SpawnResponse = { source: CommandSource };

const createJobId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ffmpeg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createStream = () => {
  const listeners: StreamHandler[] = [];
  return {
    on: (_event: "data", handler: StreamHandler) => {
      listeners.push(handler);
    },
    emit: (data: string) => {
      for (const handler of listeners) {
        handler(data);
      }
    },
    clear: () => {
      listeners.length = 0;
    }
  };
};

type CommandEmitter = CommandHandle & {
  emitClose: (payload: { code: number | null; signal: number | null }) => void;
  emitError: (message: string) => void;
  emitStdout: (data: string) => void;
  emitStderr: (data: string) => void;
  dispose: () => void;
};

const createCommand = (): CommandEmitter => {
  const stdout = createStream();
  const stderr = createStream();
  const closeListeners: CloseHandler[] = [];
  const errorListeners: ErrorHandler[] = [];

  return {
    stdout: {
      on: stdout.on
    },
    stderr: {
      on: stderr.on
    },
    on: (event: "close" | "error", handler: CloseHandler | ErrorHandler) => {
      if (event === "close") {
        closeListeners.push(handler as CloseHandler);
      } else {
        errorListeners.push(handler as ErrorHandler);
      }
    },
    emitClose: (payload: { code: number | null; signal: number | null }) => {
      for (const handler of closeListeners) {
        handler(payload);
      }
    },
    emitError: (message: string) => {
      for (const handler of errorListeners) {
        handler(message);
      }
    },
    emitStdout: stdout.emit,
    emitStderr: stderr.emit,
    dispose: () => {
      stdout.clear();
      stderr.clear();
      closeListeners.length = 0;
      errorListeners.length = 0;
    }
  };
};

const attachListeners = async (jobId: string, command: CommandEmitter) => {
  const unlistenStdout = await listen<StreamPayload>(EVENTS.stdout, (event) => {
    if (event.payload.jobId === jobId) {
      command.emitStdout(event.payload.data);
    }
  });

  const unlistenStderr = await listen<StreamPayload>(EVENTS.stderr, (event) => {
    if (event.payload.jobId === jobId) {
      command.emitStderr(event.payload.data);
    }
  });

  const unlistenError = await listen<ErrorPayload>(EVENTS.error, (event) => {
    if (event.payload.jobId === jobId) {
      command.emitError(event.payload.message);
    }
  });

  const unlistenClose = await listen<ClosePayload>(EVENTS.close, (event) => {
    if (event.payload.jobId === jobId) {
      command.emitClose({
        code: event.payload.code ?? null,
        signal: event.payload.signal ?? null
      });
    }
  });

  return () => {
    unlistenStdout();
    unlistenStderr();
    unlistenError();
    unlistenClose();
    command.dispose();
  };
};

export const executeWithFallback = async (
  program: ProgramId,
  args: string[],
  _options?: SpawnOptions
) => invoke<ExecuteResponse>("ffmpeg_execute", { program, args });

export const spawnWithFallback = async (
  program: ProgramId,
  args: string[],
  bind: CommandBinder,
  _options?: SpawnOptions
) => {
  const jobId = createJobId();
  const command = createCommand();
  const cleanup = await attachListeners(jobId, command);
  let response: SpawnResponse;

  try {
    response = await invoke<SpawnResponse>("ffmpeg_spawn", { program, args, jobId });
  } catch (error) {
    cleanup();
    debug("%s spawn failed: %O", program, error);
    throw error;
  }

  bind(command, response.source);

  let cleaned = false;
  const finalize = (..._payload: unknown[]) => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    cleanup();
  };

  command.on("close", finalize);
  command.on("error", finalize);

  const child = {
    kill: () => invoke("ffmpeg_kill", { jobId })
  };

  return { command, child, source: response.source };
};
