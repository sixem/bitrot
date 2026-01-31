// Tracks NVENC capability and triggers a probe when the modal opens.
import { useEffect, useState } from "react";
import { getNvencSupportStatus, probeNvencSupport } from "@/jobs/encoding";

const useNvencStatus = (isOpen: boolean) => {
  const [nvencStatus, setNvencStatus] = useState(getNvencSupportStatus());
  const nvencAvailable = nvencStatus === "supported";

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let isActive = true;
    probeNvencSupport()
      .then(() => {
        if (isActive) {
          setNvencStatus(getNvencSupportStatus());
        }
      })
      .catch(() => {
        if (isActive) {
          setNvencStatus(getNvencSupportStatus());
        }
      });
    return () => {
      isActive = false;
    };
  }, [isOpen]);

  return { nvencAvailable, nvencStatus };
};

export default useNvencStatus;
