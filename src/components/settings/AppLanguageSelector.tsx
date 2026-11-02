import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import {
  SUPPORTED_LANGUAGES,
  resolveAppLanguage,
  type SupportedLanguageCode,
} from "../../i18n";
import { useSettings } from "@/hooks/useSettings";

interface AppLanguageSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AppLanguageSelector: React.FC<AppLanguageSelectorProps> =
  React.memo(({ descriptionMode = "inline", grouped = false }) => {
    const { t, i18n } = useTranslation();
    const { settings, updateSetting, isUpdating } = useSettings();

    const previewLanguages = settings?.preview_languages ?? false;
    const currentLanguage = resolveAppLanguage(
      settings?.app_language || i18n.language,
      previewLanguages,
    ) as SupportedLanguageCode;

    const languageOptions = SUPPORTED_LANGUAGES.filter(
      (lang) => lang.reviewed || previewLanguages,
    ).map((lang) => ({
      value: lang.code,
      label: lang.reviewed
        ? `${lang.nativeName} (${lang.name})`
        : t("appLanguage.previewOption", {
            nativeName: lang.nativeName,
            name: lang.name,
          }),
    }));

    const handleLanguageChange = (langCode: string) => {
      i18n.changeLanguage(langCode);
      updateSetting("app_language", langCode);
    };

    const handlePreviewChange = (enabled: boolean) => {
      updateSetting("preview_languages", enabled);
      void i18n.changeLanguage(
        resolveAppLanguage(settings?.app_language || i18n.language, enabled),
      );
    };

    return (
      <>
        <SettingContainer
          title={t("appLanguage.title")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        >
          <Dropdown
            options={languageOptions}
            selectedValue={currentLanguage}
            onSelect={handleLanguageChange}
          />
        </SettingContainer>
        <ToggleSwitch
          checked={previewLanguages}
          onChange={handlePreviewChange}
          isUpdating={isUpdating("preview_languages")}
          label={t("appLanguage.preview.label")}
          description={t("appLanguage.preview.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        />
      </>
    );
  });

AppLanguageSelector.displayName = "AppLanguageSelector";
