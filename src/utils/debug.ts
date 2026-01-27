import createDebug from "debug";

// Central debug namespace helper so logs stay consistent across modules.
const BASE_NAMESPACE = "bitrot";

export const makeDebug = (scope: string) => createDebug(`${BASE_NAMESPACE}:${scope}`);

export const enableDebugLogging = (pattern = `${BASE_NAMESPACE}:*`) => {
  createDebug.enable(pattern);
};

export default makeDebug;

