// Polyfills for legacy browsers (DJI RC Plus Chromium 70) – must be first
import "./lib/legacyPolyfills";

// Initialize Sentry before anything else
import "./lib/sentry";

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload once when a new service worker takes control (post-deploy freshness).
// Skip on first-time claim (no prior controller = SW just claimed an uncontrolled page,
// code is identical to what's already running) and on /reset-password (would consume
// the one-time recovery token mid-flow).
if ("serviceWorker" in navigator) {
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;
  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    if (!hadControllerAtLoad) return;
    if (location.pathname.startsWith("/reset-password")) return;
    hasReloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
