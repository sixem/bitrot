import Modal from "@/ui/modal/Modal";

type ShutdownModalProps = {
  isOpen: boolean;
  message: string;
  onForceClose: () => void;
};

// Status modal shown while the app is cleaning up before exit.
const ShutdownModal = ({ isOpen, message, onForceClose }: ShutdownModalProps) => (
  <Modal
    isOpen={isOpen}
    title="Closing BitRot"
    message={message}
    confirmLabel="Quit now"
    onConfirm={onForceClose}
    onClose={onForceClose}
  />
);

export default ShutdownModal;
