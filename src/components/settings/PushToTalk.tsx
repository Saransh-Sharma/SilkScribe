import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface PushToTalkProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const PushToTalk: React.FC<PushToTalkProps> = React.memo(
  ({ descriptionMode = "inline", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const pttEnabled = getSetting("push_to_talk") || false;

    return (
      <>
        <ToggleSwitch
          checked={pttEnabled}
          onChange={(enabled) => updateSetting("push_to_talk", enabled)}
          isUpdating={isUpdating("push_to_talk")}
          label={t("settings.general.pushToTalk.label")}
          description={t("settings.general.pushToTalk.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        />
        {pttEnabled && (
          <ToggleSwitch
            checked={getSetting("tap_to_lock") ?? false}
            onChange={(enabled) => updateSetting("tap_to_lock", enabled)}
            isUpdating={isUpdating("tap_to_lock")}
            label={t("settings.general.tapToLock.label")}
            description={t("settings.general.tapToLock.description")}
            descriptionMode={descriptionMode}
            grouped={grouped}
          />
        )}
      </>
    );
  },
);
