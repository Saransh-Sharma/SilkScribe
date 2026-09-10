import React from "react";
import ReactDOM from "react-dom/client";
// theme.css must be imported before RecordingOverlay so that the overlay's own
// stylesheet is injected *after* it and wins any source-order tie — notably the
// reduced-motion rules, where both sides use `!important`.
import "@/theme.css";
import "@/i18n";
import RecordingOverlay from "./RecordingOverlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
