import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import ToastStack from "@/ui/toast/ToastStack";
import type { ToastItem, ToastTone } from "@/ui/toast/ToastTypes";

type ToastContextValue = {
  pushToast: (message: string, tone?: ToastTone) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

type ToastProviderProps = {
  children: ReactNode;
};

const TOAST_DURATION = 3200;

const createToastId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Provides a lightweight toast system for status messages.
const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = createToastId();
      setToasts((prev) => [...prev, { id, message, tone }]);
      const timer = window.setTimeout(() => removeToast(id), TOAST_DURATION);
      timers.current.set(id, timer);
    },
    [removeToast]
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    []
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
};

export default ToastProvider;
