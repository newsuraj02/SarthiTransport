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

// Without this, ANY uncaught error anywhere in App's render tree — a real
// bug, or a resource that failed to load after the service worker's caching
// (see service-worker.js) — takes down the whole page with nothing but a
// blank white screen and no way back in short of knowing to force-quit and
// reopen. This guarantees a recoverable screen instead. Reload also clears
// the Cache Storage first, so a stale/corrupt cached bundle (the most
// likely real-world cause of a crash right after a fresh deploy) can't
// just crash the app again in exactly the same way.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }
  handleReload = () => {
    if ("caches" in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).finally(() => window.location.reload());
    } else {
      window.location.reload();
    }
  };
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", fontFamily: "system-ui, sans-serif", background: "#FAFAF7" }}>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#2A211C" }}>कुछ गड़बड़ हो गई / Something went wrong</p>
          <p style={{ fontSize: 13, color: "#6B6058", marginBottom: 20 }}>कृपया दोबारा कोशिश करें / Please try again</p>
          <button onClick={this.handleReload} style={{ background: "#0B3D91", color: "#fff", border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 15, fontWeight: 700 }}>
            फिर से लोड करें / Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleMapsProvider>
        <App />
      </GoogleMapsProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
