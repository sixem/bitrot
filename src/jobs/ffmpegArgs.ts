// Shared ffmpeg argument helpers to keep encoding behavior consistent.

// libx264 requires even dimensions; we trim odd pixels safely when needed.
export const SAFE_SCALE_FILTER = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1";

export const getExtension = (path: string) => {
  const clean = path.trim().toLowerCase();
  const dotIndex = clean.lastIndexOf(".");
  return dotIndex >= 0 ? clean.slice(dotIndex + 1) : "";
};

export const buildAudioArgs = (
  outputPath: string,
  options?: { enabled?: boolean }
) => {
  if (options?.enabled === false) {
    return ["-an"];
  }
  const extension = getExtension(outputPath);
  if (extension === "webm") {
    return ["-c:a", "libopus", "-b:a", "160k"];
  }
  if (extension === "mp4" || extension === "m4v" || extension === "mov") {
    return ["-c:a", "aac", "-b:a", "192k"];
  }
  // MKV and other containers default to AAC for predictable playback.
  return ["-c:a", "aac", "-b:a", "192k"];
};

export const buildContainerArgs = (outputPath: string) => {
  const extension = getExtension(outputPath);
  return extension === "mp4" || extension === "m4v" || extension === "mov"
    ? ["-movflags", "+faststart"]
    : [];
};

const SAFE_EXTRA_ARGS: Record<string, number> = {
  "-tune": 1,
  "-profile:v": 1,
  "-level": 1,
  "-pix_fmt": 1,
  "-movflags": 1,
  "-colorspace": 1,
  "-color_primaries": 1,
  "-color_trc": 1,
  "-aq-mode": 1,
  "-row-mt": 1,
  "-tile-columns": 1,
  "-threads": 1,
  "-g": 1,
  "-keyint_min": 1,
  "-bf": 1,
  "-refs": 1,
  "-rc-lookahead": 1
};

const tokenizeArgs = (raw: string) => {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens;
};

// Filters extra args so only safe, single-value flags are appended.
export const parseExtraArgs = (raw: string) => {
  if (!raw.trim()) {
    return [];
  }
  const tokens = tokenizeArgs(raw);
  const safe: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("-")) {
      continue;
    }
    const argCount = SAFE_EXTRA_ARGS[token];
    if (!argCount) {
      continue;
    }
    const value = tokens[index + 1];
    if (!value) {
      break;
    }
    safe.push(token, value);
    index += argCount;
  }
  return safe;
};
