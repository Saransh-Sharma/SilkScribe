import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Globe } from "lucide-react";
import type { ModelCardStatus } from "@/components/onboarding";
import { ModelCard } from "@/components/onboarding";
import { useModelStore } from "@/stores/modelStore";
import { LANGUAGES } from "@/lib/constants/languages.ts";
import type { ModelInfo } from "@/bindings";
import { AppPage } from "@/components/ui";
import { SettingsGroup } from "@/components/ui/SettingsGroup";
import { LanguageSelector } from "../LanguageSelector";
import { TranslateToEnglish } from "../TranslateToEnglish";

// check if model supports a language based on its supported_languages list
const modelSupportsLanguage = (model: ModelInfo, langCode: string): boolean => {
  return model.supported_languages.includes(langCode);
};

export const ModelsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState("all");
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const languageSearchInputRef = useRef<HTMLInputElement>(null);
  const {
    models,
    currentModel,
    downloadingModels,
    downloadProgress,
    downloadStats,
    extractingModels,
    loading,
    downloadModel,
    cancelDownload,
    selectModel,
    deleteModel,
  } = useModelStore();

  // click outside handler for language dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setLanguageDropdownOpen(false);
        setLanguageSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // focus search input when dropdown opens
  useEffect(() => {
    if (languageDropdownOpen && languageSearchInputRef.current) {
      languageSearchInputRef.current.focus();
    }
  }, [languageDropdownOpen]);

  // filtered languages for dropdown (exclude "auto")
  const filteredLanguages = useMemo(() => {
    return LANGUAGES.filter(
      (lang) =>
        lang.value !== "auto" &&
        lang.label.toLowerCase().includes(languageSearch.toLowerCase()),
    );
  }, [languageSearch]);

  // Get selected language label
  const selectedLanguageLabel = useMemo(() => {
    if (languageFilter === "all") {
      return t("settings.models.filters.allLanguages");
    }
    return LANGUAGES.find((lang) => lang.value === languageFilter)?.label || "";
  }, [languageFilter, t]);

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) {
      return "extracting";
    }
    if (modelId in downloadingModels) {
      return "downloading";
    }
    if (switchingModelId === modelId) {
      return "switching";
    }
    if (modelId === currentModel) {
      return "active";
    }
    const model = models.find((m: ModelInfo) => m.id === modelId);
    if (model?.is_downloaded) {
      return "available";
    }
    return "downloadable";
  };

  const getDownloadProgress = (modelId: string): number | undefined => {
    const progress = downloadProgress[modelId];
    return progress?.percentage;
  };

  const getDownloadSpeed = (modelId: string): number | undefined => {
    const stats = downloadStats[modelId];
    return stats?.speed;
  };

  const handleModelSelect = async (modelId: string) => {
    setSwitchingModelId(modelId);
    try {
      await selectModel(modelId);
    } finally {
      setSwitchingModelId(null);
    }
  };

  const handleModelDownload = async (modelId: string) => {
    await downloadModel(modelId);
  };

  const handleModelDelete = async (modelId: string) => {
    const model = models.find((m: ModelInfo) => m.id === modelId);
    const modelName = model?.name || modelId;
    const isActive = modelId === currentModel;

    const confirmed = await ask(
      isActive
        ? t("settings.models.deleteActiveConfirm", { modelName })
        : t("settings.models.deleteConfirm", { modelName }),
      {
        title: t("settings.models.deleteTitle"),
        kind: "warning",
      },
    );

    if (confirmed) {
      try {
        await deleteModel(modelId);
      } catch (err) {
        console.error(`Failed to delete model ${modelId}:`, err);
      }
    }
  };

  const handleModelCancel = async (modelId: string) => {
    try {
      await cancelDownload(modelId);
    } catch (err) {
      console.error(`Failed to cancel download for ${modelId}:`, err);
    }
  };

  // Filter models based on language filter
  const filteredModels = useMemo(() => {
    return models.filter((model: ModelInfo) => {
      if (languageFilter !== "all") {
        if (!modelSupportsLanguage(model, languageFilter)) return false;
      }
      return true;
    });
  }, [models, languageFilter]);

  // Split filtered models into downloaded (including custom) and available sections
  const { downloadedModels, availableModels } = useMemo(() => {
    const downloaded: ModelInfo[] = [];
    const available: ModelInfo[] = [];

    for (const model of filteredModels) {
      if (
        model.is_custom ||
        model.is_downloaded ||
        model.id in downloadingModels ||
        model.id in extractingModels
      ) {
        downloaded.push(model);
      } else {
        available.push(model);
      }
    }

    // Sort: active model first, then non-custom, then custom at the bottom
    downloaded.sort((a, b) => {
      if (a.id === currentModel) return -1;
      if (b.id === currentModel) return 1;
      if (a.is_custom !== b.is_custom) return a.is_custom ? 1 : -1;
      return 0;
    });

    return {
      downloadedModels: downloaded,
      availableModels: available,
    };
  }, [filteredModels, downloadingModels, extractingModels, currentModel]);

  const currentModelInfo =
    models.find((model: ModelInfo) => model.id === currentModel) ?? null;
  const supportsLanguageSelection =
    currentModelInfo?.engine_type === "Whisper" ||
    currentModelInfo?.engine_type === "SenseVoice";
  const supportsTranslation = currentModelInfo?.supports_translation ?? false;
  const installedModels = downloadedModels.filter(
    (model) => model.id !== currentModel,
  );

  const filterControl = (
    <div className="relative" ref={languageDropdownRef}>
      <button
        type="button"
        onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
        className={`flex min-h-10 items-center gap-1.5 rounded-[var(--ss-radius-pill)] border px-3 py-1.5 text-sm font-medium transition-[background-color,border-color,color] duration-150 ${
          languageFilter !== "all"
            ? "border-ss-brand-secondary/30 bg-ss-brand-secondary/12 text-ss-brand-secondary"
            : "border-ss-border-subtle bg-ss-bg-surface-alt text-ss-text-tertiary hover:text-ss-text-secondary"
        }`}
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="max-w-[120px] truncate">{selectedLanguageLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            languageDropdownOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {languageDropdownOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-[18px] border border-ss-border-default bg-ss-bg-surface shadow-[var(--ss-shadow-lift)]">
          <div className="border-b border-ss-border-subtle p-2">
            <input
              ref={languageSearchInputRef}
              type="text"
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredLanguages.length > 0) {
                  setLanguageFilter(filteredLanguages[0].value);
                  setLanguageDropdownOpen(false);
                  setLanguageSearch("");
                } else if (e.key === "Escape") {
                  setLanguageDropdownOpen(false);
                  setLanguageSearch("");
                }
              }}
              placeholder={t("settings.general.language.searchPlaceholder")}
              className="w-full rounded-[12px] border border-ss-border-default bg-ss-bg-elevated px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ss-action-focus/30"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                setLanguageFilter("all");
                setLanguageDropdownOpen(false);
                setLanguageSearch("");
              }}
              className={`w-full rounded-[12px] px-3 py-2 text-left text-sm transition-colors ${
                languageFilter === "all"
                  ? "bg-ss-brand-secondary/12 font-semibold text-ss-brand-secondary"
                  : "text-ss-text-secondary hover:bg-ss-bg-surface-alt"
              }`}
            >
              {t("settings.models.filters.allLanguages")}
            </button>
            {filteredLanguages.map((lang) => (
              <button
                key={lang.value}
                type="button"
                onClick={() => {
                  setLanguageFilter(lang.value);
                  setLanguageDropdownOpen(false);
                  setLanguageSearch("");
                }}
                className={`w-full rounded-[12px] px-3 py-2 text-left text-sm transition-colors ${
                  languageFilter === lang.value
                    ? "bg-ss-brand-secondary/12 font-semibold text-ss-brand-secondary"
                    : "text-ss-text-secondary hover:bg-ss-bg-surface-alt"
                }`}
              >
                {lang.label}
              </button>
            ))}
            {filteredLanguages.length === 0 && (
              <div className="px-3 py-3 text-center text-sm text-ss-text-tertiary">
                {t("settings.general.language.noResults")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-ss-brand-secondary border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <AppPage
      eyebrow={t("settings.models.eyebrow")}
      title={t("settings.models.pageTitle")}
      description={t("settings.models.pageDescription")}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
              {t("settings.models.currentModel")}
            </h2>
          </div>
          {currentModelInfo ? (
            <>
              <ModelCard
                model={currentModelInfo}
                layout="settings"
                status={getModelStatus(currentModelInfo.id)}
                onSelect={handleModelSelect}
                onDownload={handleModelDownload}
                onDelete={handleModelDelete}
                onCancel={handleModelCancel}
                downloadProgress={getDownloadProgress(currentModelInfo.id)}
                downloadSpeed={getDownloadSpeed(currentModelInfo.id)}
                showRecommended={false}
              />
              {supportsLanguageSelection || supportsTranslation ? (
                <SettingsGroup
                  title={t("settings.models.currentModelSettings")}
                  description={t("settings.models.currentModelSettingsDescription")}
                >
                  {supportsLanguageSelection ? (
                    <LanguageSelector
                      descriptionMode="inline"
                      grouped={true}
                      supportedLanguages={currentModelInfo.supported_languages}
                    />
                  ) : null}
                  {supportsTranslation ? (
                    <TranslateToEnglish descriptionMode="inline" grouped={true} />
                  ) : null}
                </SettingsGroup>
              ) : null}
            </>
          ) : (
            <div className="rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface px-5 py-6 text-sm text-ss-text-secondary shadow-[var(--ss-shadow-card)]">
              <p className="font-semibold text-ss-text-primary">
                {t("settings.models.noActiveModelTitle")}
              </p>
              <p className="mt-2 leading-relaxed">
                {t("settings.models.noActiveModelDescription")}
              </p>
            </div>
          )}
        </div>

        {filteredModels.length > 0 ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 px-1">
                <div className="min-w-0">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
                    {t("settings.models.yourModels")}
                  </h2>
                </div>
                {filterControl}
              </div>
              {installedModels.length > 0 ? (
                installedModels.map((model: ModelInfo) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    layout="settings"
                    status={getModelStatus(model.id)}
                    onSelect={handleModelSelect}
                    onDownload={handleModelDownload}
                    onDelete={handleModelDelete}
                    onCancel={handleModelCancel}
                    downloadProgress={getDownloadProgress(model.id)}
                    downloadSpeed={getDownloadSpeed(model.id)}
                    showRecommended={false}
                  />
                ))
              ) : (
                <div className="rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface px-5 py-6 text-sm text-ss-text-secondary shadow-[var(--ss-shadow-card)]">
                  {t("settings.models.noExtraInstalled")}
                </div>
              )}
            </div>

            {availableModels.length > 0 && (
              <div className="space-y-3">
                <div className="px-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
                    {t("settings.models.availableModels")}
                  </h2>
                </div>
                {availableModels.map((model: ModelInfo) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    layout="settings"
                    status={getModelStatus(model.id)}
                    onSelect={handleModelSelect}
                    onDownload={handleModelDownload}
                    onDelete={handleModelDelete}
                    onCancel={handleModelCancel}
                    downloadProgress={getDownloadProgress(model.id)}
                    downloadSpeed={getDownloadSpeed(model.id)}
                    showRecommended={false}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface px-5 py-8 text-center text-sm text-ss-text-tertiary shadow-[var(--ss-shadow-card)]">
            {t("settings.models.noModelsMatch")}
          </div>
        )}
      </div>
    </AppPage>
  );
};
