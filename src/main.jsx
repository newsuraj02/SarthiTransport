import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { GoogleMapsProvider } from "./googleMapsContext.jsx";
import "./index.css";

// Registers the service worker (also used for background push, see
// firebaseClient.js) as soon as the app loads, not just once a user grants
// notification permission — so the app-shell caching benefit applies to
// every visitor from their first visit.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((e) => console.error("[sw] register failed", e));
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GoogleMapsProvider>
      <App />
    </GoogleMapsProvider>
  </React.StrictMode>
);
