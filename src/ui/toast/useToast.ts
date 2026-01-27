import { useContext } from "react";
import { ToastContext } from "@/ui/toast/ToastProvider";

// Access the global toast dispatcher.
const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
};

export default useToast;
