import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import type { ClipboardHandling, PasteMethod } from "@/bindings";

interface ClipboardHandlingProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ClipboardHandlingSetting: React.FC<ClipboardHandlingProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const clipboardHandlingOptions = [
      {
        value: "dont_modify",
        label: t("settings.advanced.clipboardHandling.options.dontModify"),
      },
      {
        value: "copy_to_clipboard",
        label: t("settings.advanced.clipboardHandling.options.copyToClipboard"),
      },
    ];

    const selectedHandling = (getSetting("clipboard_handling") ||
      "dont_modify") as ClipboardHandling;
    const selectedPasteMethod = getSetting("paste_method") as
      | PasteMethod
      | undefined;
    const usesClipboardHotkey =
      selectedPasteMethod === "ctrl_v" ||
      selectedPasteMethod === "ctrl_shift_v" ||
      selectedPasteMethod === "shift_insert";
    const showDirectInsertHint =
      selectedHandling === "dont_modify" && usesClipboardHotkey;

    return (
      <SettingContainer
        title={t("settings.advanced.clipboardHandling.title")}
        description={t("settings.advanced.clipboardHandling.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <div className="flex flex-col items-end gap-2">
          <Dropdown
            options={clipboardHandlingOptions}
            selectedValue={selectedHandling}
            onSelect={(value) =>
              updateSetting("clipboard_handling", value as ClipboardHandling)
            }
            disabled={isUpdating("clipboard_handling")}
          />
          {showDirectInsertHint && (
            <p className="max-w-64 text-right text-[11px] leading-relaxed text-ss-text-tertiary">
              {t("settings.advanced.clipboardHandling.directInsertHint")}
            </p>
          )}
        </div>
      </SettingContainer>
    );
  });
