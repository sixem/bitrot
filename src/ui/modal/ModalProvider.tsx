import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import Modal from "@/ui/modal/Modal";

export type ModalPayload = {
  title: string;
  message: string;
  confirmLabel?: string;
};

type ModalContextValue = {
  openModal: (payload: ModalPayload) => void;
  closeModal: () => void;
};

export const ModalContext = createContext<ModalContextValue | null>(null);

type ModalProviderProps = {
  children: ReactNode;
};

// Provides a single modal surface for the app.
const ModalProvider = ({ children }: ModalProviderProps) => {
  const [modal, setModal] = useState<ModalPayload | null>(null);

  const openModal = useCallback((payload: ModalPayload) => {
    setModal(payload);
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  const value = useMemo(
    () => ({
      openModal,
      closeModal
    }),
    [openModal, closeModal]
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      <Modal
        isOpen={modal !== null}
        title={modal?.title ?? ""}
        message={modal?.message ?? ""}
        confirmLabel={modal?.confirmLabel}
        onClose={closeModal}
      />
    </ModalContext.Provider>
  );
};

export default ModalProvider;
