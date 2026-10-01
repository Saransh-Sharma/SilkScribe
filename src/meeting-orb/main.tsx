import React from "react";
import ReactDOM from "react-dom/client";
// theme.css must come before MeetingOrb so the orb's stylesheet wins source-order
// ties, notably the reduced-motion rules where both sides use `!important`.
import "@/theme.css";
import "@/i18n";
import MeetingOrb from "./MeetingOrb";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MeetingOrb />
  </React.StrictMode>,
);
