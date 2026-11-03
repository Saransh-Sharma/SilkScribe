import type React from "react";
import { DebugSettings } from "./debug/DebugSettings";

export type SettingsSection = "debug";

/** Settings pages the workspace embeds whole; everything else is laid out by
 * Preferences. */
export const SETTINGS_SECTIONS: Record<SettingsSection, React.ComponentType> = {
  debug: DebugSettings,
};
