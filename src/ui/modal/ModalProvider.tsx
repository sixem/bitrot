import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";
import Modal from "@/ui/modal/Modal";

export type ModalPayload = {
  title?: string;
  ariaLabel?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};

type ModalContextValue = {
  openModal: (payload: ModalPayload) => void;
  openConfirm: (payload: ModalPayload) => Promise<boolean>;
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

  const openConfirm = useCallback((payload: ModalPayload) => {
    return new Promise<boolean>((resolve) => {
      setModal({
        ...payload,
        confirmLabel: payload.confirmLabel ?? "Confirm",
        cancelLabel: payload.cancelLabel ?? "Cancel",
        onConfirm: () => {
          resolve(true);
          setModal(null);
        },
        onCancel: () => {
          resolve(false);
          setModal(null);
        }
      });
    });
  }, []);

  const value = useMemo(
    () => ({
      openModal,
      openConfirm,
      closeModal
    }),
    [openModal, openConfirm, closeModal]
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      <Modal
        isOpen={modal !== null}
        title={modal?.title}
        ariaLabel={modal?.ariaLabel}
        message={modal?.message ?? ""}
        confirmLabel={modal?.confirmLabel}
        cancelLabel={modal?.cancelLabel}
        onConfirm={modal?.onConfirm}
        onCancel={modal?.onCancel}
        onClose={closeModal}
      />
    </ModalContext.Provider>
  );
};

export default ModalProvider;
