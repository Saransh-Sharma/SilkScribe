import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer } from "../ui/SettingContainer";
import { ResetButton } from "../ui/ResetButton";
import { useSettings } from "../../hooks/useSettings";
import { LANGUAGES } from "../../lib/constants/languages";

interface LanguageSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  supportedLanguages?: string[];
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
  supportedLanguages,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, resetSetting, isUpdating } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedLanguage = getSetting("selected_language") || "auto";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const availableLanguages = useMemo(() => {
    if (!supportedLanguages || supportedLanguages.length === 0)
      return LANGUAGES;
    return LANGUAGES.filter(
      (lang) =>
        lang.value === "auto" || supportedLanguages.includes(lang.value),
    );
  }, [supportedLanguages]);

  const filteredLanguages = useMemo(
    () =>
      availableLanguages.filter((language) =>
        language.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery, availableLanguages],
  );

  const selectedLanguageName =
    LANGUAGES.find((lang) => lang.value === selectedLanguage)?.label ||
    t("settings.general.language.auto");

  const handleLanguageSelect = async (languageCode: string) => {
    await updateSetting("selected_language", languageCode);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleReset = async () => {
    await resetSetting("selected_language");
  };

  const handleToggle = () => {
    if (isUpdating("selected_language")) return;
    setIsOpen(!isOpen);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && filteredLanguages.length > 0) {
      // Select first filtered language on Enter
      handleLanguageSelect(filteredLanguages[0].value);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <SettingContainer
      title={t("settings.general.language.title")}
      description={t("settings.general.language.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
    >
      <div className="flex items-center gap-2">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className={`flex min-h-10 min-w-[220px] items-center justify-between gap-2 rounded-[var(--ss-radius-md)] border px-3 py-2 text-left text-sm font-medium shadow-[var(--ss-shadow-card)] transition-[transform,background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/45 ${
              isUpdating("selected_language")
                ? "cursor-not-allowed border-ss-border-default bg-ss-bg-elevated text-ss-text-disabled opacity-60"
                : "cursor-pointer border-ss-border-default bg-ss-bg-elevated text-ss-text-primary hover:-translate-y-0.5 hover:border-ss-brand-secondary/30 hover:bg-ss-bg-surface hover:shadow-[var(--ss-shadow-lift)]"
            }`}
            onClick={handleToggle}
            disabled={isUpdating("selected_language")}
          >
            <span className="truncate">{selectedLanguageName}</span>
            <svg
              className={`h-4 w-4 shrink-0 text-ss-text-tertiary transition-transform duration-200 ${
                isOpen ? "transform rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {isOpen && !isUpdating("selected_language") && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-hidden rounded-[18px] border border-ss-border-default bg-ss-bg-surface shadow-[var(--ss-shadow-lift)]">
              {/* Search input */}
              <div className="border-b border-ss-border-subtle p-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t("settings.general.language.searchPlaceholder")}
                  className="w-full rounded-[12px] border border-ss-border-default bg-ss-bg-elevated px-3 py-2 text-sm text-ss-text-primary placeholder:text-ss-text-tertiary focus:outline-none focus:ring-2 focus:ring-ss-action-focus/35"
                />
              </div>

              <div className="max-h-48 overflow-y-auto p-1">
                {filteredLanguages.length === 0 ? (
                  <div className="px-3 py-3 text-center text-sm text-ss-text-tertiary">
                    {t("settings.general.language.noResults")}
                  </div>
                ) : (
                  filteredLanguages.map((language) => (
                    <button
                      key={language.value}
                      type="button"
                      className={`w-full rounded-[12px] px-3 py-2 text-left text-sm transition-colors duration-150 ${
                        selectedLanguage === language.value
                          ? "bg-ss-brand-secondary/12 font-semibold text-ss-brand-secondary"
                          : "text-ss-text-secondary hover:bg-ss-bg-surface-alt"
                      }`}
                      onClick={() => handleLanguageSelect(language.value)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{language.label}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <ResetButton
          onClick={handleReset}
          disabled={isUpdating("selected_language")}
        />
      </div>
      {isUpdating("selected_language") && (
        <div className="absolute inset-0 flex items-center justify-center rounded-[var(--ss-radius-md)] bg-ss-bg-surface/80 backdrop-blur-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-ss-brand-secondary border-t-transparent" />
        </div>
      )}
    </SettingContainer>
  );
};
