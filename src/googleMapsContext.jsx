import React, { createContext, useContext } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

const GOOGLE_MAPS_LIBRARIES = ["places"];
const GoogleMapsContext = createContext({ isLoaded: false, loadError: null, hasKey: false });

// Places Autocomplete's suggestion language follows this script-load param —
// there's no per-request or per-instance override, and Google's JS API
// can't hot-swap it after loading, so it's read directly from localStorage
// (same key/shape as the app's own usePersistedState("sarthi_lang", ...))
// once, here, rather than from React state. The language toggle forces a
// full page reload when switched (see the button in App.jsx) specifically
// so this picks up the new value on the next load.
function readPersistedLang() {
  try {
    const raw = window.localStorage.getItem("sarthi_lang");
    return raw !== null ? JSON.parse(raw) : "hi";
  } catch {
    return "hi";
  }
}

export function GoogleMapsProvider({ children }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    id: "sarthi-google-maps",
    googleMapsApiKey: apiKey || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    language: readPersistedLang() === "en" ? "en" : "hi",
    region: "IN",
  });
  return (
    <GoogleMapsContext.Provider value={{ isLoaded: !!apiKey && isLoaded, loadError, hasKey: !!apiKey }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}
