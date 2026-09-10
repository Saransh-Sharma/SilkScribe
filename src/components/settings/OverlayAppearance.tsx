import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import type { OverlayAppearance as OverlayAppearanceValue } from "@/bindings";

interface OverlayAppearanceProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Pins the recording overlay to a light or dark treatment, or lets it follow
 * the app theme. Useful when the app theme doesn't match the desktop the
 * overlay actually floats over.
 */
export const OverlayAppearance: React.FC<OverlayAppearanceProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const options = [
      {
        value: "auto",
        label: t("settings.advanced.overlayAppearance.options.auto"),
      },
      {
        value: "light",
        label: t("settings.advanced.overlayAppearance.options.light"),
      },
      {
        value: "dark",
        label: t("settings.advanced.overlayAppearance.options.dark"),
      },
    ];

    const selected = (getSetting("overlay_appearance") ||
      "auto") as OverlayAppearanceValue;

    return (
      <SettingContainer
        title={t("settings.advanced.overlayAppearance.title")}
        description={t("settings.advanced.overlayAppearance.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={options}
          selectedValue={selected}
          onSelect={(value) =>
            updateSetting("overlay_appearance", value as OverlayAppearanceValue)
          }
          disabled={isUpdating("overlay_appearance")}
        />
      </SettingContainer>
    );
  },
);

OverlayAppearance.displayName = "OverlayAppearance";
