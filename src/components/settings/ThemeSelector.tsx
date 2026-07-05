import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "@/hooks/useSettings";
import type { ThemePreference } from "@/bindings";

interface ThemeSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { settings, updateSetting } = useSettings();
    const currentTheme = settings?.theme ?? "system";

    const themeOptions: Array<{ value: ThemePreference; label: string }> = [
      {
        value: "system",
        label: t("settings.general.theme.options.system"),
      },
      {
        value: "light",
        label: t("settings.general.theme.options.light"),
      },
      {
        value: "dark",
        label: t("settings.general.theme.options.dark"),
      },
    ];

    return (
      <SettingContainer
        title={t("settings.general.theme.title")}
        description={t("settings.general.theme.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={themeOptions}
          selectedValue={currentTheme}
          onSelect={(value) => updateSetting("theme", value as ThemePreference)}
        />
      </SettingContainer>
    );
  },
);

ThemeSelector.displayName = "ThemeSelector";
