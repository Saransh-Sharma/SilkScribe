import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";
import type { ClipboardHandling } from "@/bindings";

interface ClipboardHandlingProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ClipboardHandlingSetting: React.FC<ClipboardHandlingProps> =
  React.memo(({ descriptionMode = "inline", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    // Only macOS can put the old clipboard back after pasting; elsewhere a
    // clipboard paste always leaves the text on it.
    const canRestore = useOsType() === "macos";

    const clipboardHandlingOptions = [
      ...(canRestore
        ? [
            {
              value: "dont_modify",
              label: t(
                "settings.advanced.clipboardHandling.options.dontModify",
              ),
            },
          ]
        : []),
      {
        value: "copy_to_clipboard",
        label: t("settings.advanced.clipboardHandling.options.copyToClipboard"),
      },
    ];

    const selectedHandling = (
      canRestore
        ? getSetting("clipboard_handling") || "dont_modify"
        : "copy_to_clipboard"
    ) as ClipboardHandling;

    return (
      <SettingContainer
        title={t("settings.advanced.clipboardHandling.title")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={clipboardHandlingOptions}
          selectedValue={selectedHandling}
          onSelect={(value) =>
            updateSetting("clipboard_handling", value as ClipboardHandling)
          }
          disabled={isUpdating("clipboard_handling") || !canRestore}
        />
      </SettingContainer>
    );
  });
