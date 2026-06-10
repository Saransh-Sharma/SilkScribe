import React from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { ToggleSwitch } from "../ui/ToggleSwitch";

interface LazyStreamCloseProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const LazyStreamClose: React.FC<LazyStreamCloseProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const enabled = getSetting("lazy_stream_close") ?? false;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(nextEnabled) =>
          updateSetting("lazy_stream_close", nextEnabled)
        }
        isUpdating={isUpdating("lazy_stream_close")}
        label={t("settings.advanced.lazyStreamClose.label")}
        description={t("settings.advanced.lazyStreamClose.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);

LazyStreamClose.displayName = "LazyStreamClose";
