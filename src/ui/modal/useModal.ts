import { useContext } from "react";
import { ModalContext } from "@/ui/modal/ModalProvider";

// Access the global modal controls.
const useModal = () => {
  const context = useContext(ModalContext);

  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }

  return context;
};

export default useModal;
