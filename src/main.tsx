import React from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/styles.scss";
import { enableDebugLogging, makeDebug } from "@/utils/debug";

// Renderer entry point for the Tauri window.
const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

if (import.meta.env.DEV) {
  enableDebugLogging();
  makeDebug("app")("Debug logging enabled (pattern: bitrot:*)");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
