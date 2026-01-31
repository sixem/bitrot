import { useEffect } from "react";

let openModalCount = 0;

const setBodyLock = (isLocked: boolean) => {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  if (!body) {
    return;
  }
  if (isLocked) {
    body.dataset.modalOpen = "true";
    return;
  }
  delete body.dataset.modalOpen;
};

// Shared hook to prevent background scrolling while any modal is open.
const useModalScrollLock = (isOpen: boolean) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    openModalCount += 1;
    if (openModalCount === 1) {
      setBodyLock(true);
    }
    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        setBodyLock(false);
      }
    };
  }, [isOpen]);
};

export default useModalScrollLock;
