import type React from "react";
import { DebugSettings } from "./debug/DebugSettings";
import { ModelsSettings } from "./models/ModelsSettings";

export type SettingsSection = "models" | "debug";

/** Settings pages the workspace embeds whole; everything else is laid out by
 * Preferences. */
export const SETTINGS_SECTIONS: Record<SettingsSection, React.ComponentType> = {
  models: ModelsSettings,
  debug: DebugSettings,
};
