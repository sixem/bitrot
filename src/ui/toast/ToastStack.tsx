import type { ToastItem } from "@/ui/toast/ToastTypes";

type ToastStackProps = {
  toasts: ToastItem[];
};

// Renders active toast messages in the corner of the UI.
const ToastStack = ({ toasts }: ToastStackProps) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone ?? "info"}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
};

export default ToastStack;
