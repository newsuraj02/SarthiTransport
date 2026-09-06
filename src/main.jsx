import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { GoogleMapsProvider } from "./googleMapsContext.jsx";
import "./index.css";

// Registers the service worker as soon as the app loads, so the app-shell
// caching benefit (instant repeat visits, works on a flaky/offline
// connection) applies to every visitor from their first visit.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((e) => console.error("[sw] register failed", e));
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GoogleMapsProvider>
      <App />
    </GoogleMapsProvider>
  </React.StrictMode>
);
