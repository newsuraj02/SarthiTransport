import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { GoogleMapsProvider } from "./googleMapsContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GoogleMapsProvider>
      <App />
    </GoogleMapsProvider>
  </React.StrictMode>
);
