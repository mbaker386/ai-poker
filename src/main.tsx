import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import AIPoker from "./App";
import "./styles.css";

// Service worker: precaches the app for full offline use; auto-updates on new deploys.
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AIPoker />
  </StrictMode>,
);
