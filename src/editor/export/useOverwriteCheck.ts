// Centralizes file existence checks and overwrite prompts before exporting.
import { useEffect, useState } from "react";
import { pathExists } from "@/system/pathExists";

type OverwriteCheckArgs = {
  isOpen: boolean;
  outputPath: string;
  folderPath: string;
  isValid: boolean;
  outputMatchesInput: boolean;
  resetKey: string;
  onConfirm: () => void;
};

const useOverwriteCheck = ({
  isOpen,
  outputPath,
  folderPath,
  isValid,
  outputMatchesInput,
  resetKey,
  onConfirm
}: OverwriteCheckArgs) => {
  const [overwritePromptPath, setOverwritePromptPath] = useState<string | null>(null);
  const [missingFolderPath, setMissingFolderPath] = useState<string | null>(null);
  const [pathCheckWarning, setPathCheckWarning] = useState<string | null>(null);
  const [isCheckingOverwrite, setIsCheckingOverwrite] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setOverwritePromptPath(null);
    setMissingFolderPath(null);
    setPathCheckWarning(null);
  }, [isOpen, resetKey]);

  const handleConfirm = async () => {
    if (!isValid || isCheckingOverwrite || outputMatchesInput) {
      return;
    }

    if (overwritePromptPath === outputPath) {
      onConfirm();
      return;
    }
    if (pathCheckWarning) {
      setPathCheckWarning(null);
      onConfirm();
      return;
    }
    if (overwritePromptPath) {
      setOverwritePromptPath(null);
    }

    setIsCheckingOverwrite(true);
    // Verify destination folder exists before checking for overwrite.
    if (!folderPath) {
      setMissingFolderPath("");
      setIsCheckingOverwrite(false);
      return;
    }
    const folderExists = await pathExists(folderPath);
    if (folderExists === false) {
      setMissingFolderPath(folderPath);
      setIsCheckingOverwrite(false);
      return;
    }
    if (folderExists === null) {
      setPathCheckWarning("Unable to verify the output folder. Click Export to proceed.");
      setIsCheckingOverwrite(false);
      return;
    }
    if (missingFolderPath) {
      setMissingFolderPath(null);
    }

    const exists = await pathExists(outputPath);
    setIsCheckingOverwrite(false);

    if (exists === null) {
      setPathCheckWarning(
        "Unable to verify whether the output exists. Click Export to proceed."
      );
      return;
    }
    if (exists) {
      setOverwritePromptPath(outputPath);
      return;
    }

    onConfirm();
  };

  return {
    overwritePromptPath,
    missingFolderPath,
    pathCheckWarning,
    isCheckingOverwrite,
    handleConfirm
  };
};

export default useOverwriteCheck;
