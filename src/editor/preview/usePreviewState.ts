import { useCallback, useState } from "react";

export type PreviewState = {
  isActive: boolean;
  isLoading: boolean;
  previewUrl?: string;
  frame?: number;
  error?: string;
};

const emptyState: PreviewState = {
  isActive: false,
  isLoading: false
};

type ErrorOptions = {
  preservePreview?: boolean;
};

// Encapsulates preview state transitions to keep the parent hook readable.
const usePreviewState = () => {
  const [state, setState] = useState<PreviewState>(emptyState);

  const startLoading = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: true,
      isLoading: true,
      error: undefined
    }));
  }, []);

  const setError = useCallback((message: string, options: ErrorOptions = {}) => {
    const preservePreview = options.preservePreview ?? true;
    setState((prev) => ({
      isActive: true,
      isLoading: false,
      previewUrl: preservePreview ? prev.previewUrl : undefined,
      frame: preservePreview ? prev.frame : undefined,
      error: message
    }));
  }, []);

  const setSuccess = useCallback((previewUrl: string, frame?: number) => {
    setState({
      isActive: true,
      isLoading: false,
      previewUrl,
      frame
    });
  }, []);

  const clear = useCallback(() => {
    setState(emptyState);
  }, []);

  return {
    state,
    startLoading,
    setError,
    setSuccess,
    clear
  };
};

export default usePreviewState;
