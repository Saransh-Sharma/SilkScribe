import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelCardStatus } from "@/components/onboarding";
import { ModelCard } from "@/components/onboarding";
import { useModelStore } from "@/stores/modelStore";
import { LANGUAGES } from "@/lib/constants/languages.ts";
import type { ModelInfo } from "@/bindings";
import {
  AppPage,
  ConfirmDialog,
  EmptyState,
  Select,
  Skeleton,
} from "@/components/ui";
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
  const [modelPendingDelete, setModelPendingDelete] = useState<{
    id: string;
    name: string;
    isActive: boolean;
  } | null>(null);
  const [languageFilter, setLanguageFilter] = useState("all");
  const {
    models,
    currentModel,
    downloadingModels,
    downloadProgress,
    downloadStats,
    downloadErrors,
    extractingModels,
    loading,
    downloadModel,
    cancelDownload,
    selectModel,
    deleteModel,
  } = useModelStore();

  const languageOptions = useMemo(
    () => [
      { value: "all", label: t("settings.models.filters.allLanguages") },
      ...LANGUAGES.filter((language) => language.value !== "auto"),
    ],
    [t],
  );

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
    if (modelId in downloadErrors) {
      return "error";
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

  const getDownloadBytes = (modelId: string) => {
    const progress = downloadProgress[modelId];
    return progress
      ? { downloaded: progress.downloaded, total: progress.total }
      : undefined;
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

  const handleModelDelete = (modelId: string) => {
    const model = models.find((m: ModelInfo) => m.id === modelId);
    setModelPendingDelete({
      id: modelId,
      name: model?.name || modelId,
      isActive: modelId === currentModel,
    });
  };

  const confirmModelDelete = async () => {
    if (!modelPendingDelete) return;
    const { id } = modelPendingDelete;
    setModelPendingDelete(null);
    try {
      await deleteModel(id);
    } catch (err) {
      console.error(`Failed to delete model ${id}:`, err);
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
    <Select
      value={languageFilter}
      options={languageOptions}
      onChange={(value) => setLanguageFilter(value ?? "all")}
      isClearable={false}
      className="w-64"
    />
  );

  if (loading) {
    return (
      <div className="w-full space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton rounded="lg" className="h-28 w-full" />
        <Skeleton rounded="lg" className="h-28 w-full" />
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
                downloadBytes={getDownloadBytes(currentModelInfo.id)}
                showRecommended={false}
              />
              {supportsLanguageSelection || supportsTranslation ? (
                <SettingsGroup
                  title={t("settings.models.currentModelSettings")}
                  description={t(
                    "settings.models.currentModelSettingsDescription",
                  )}
                >
                  {supportsLanguageSelection ? (
                    <LanguageSelector
                      descriptionMode="inline"
                      grouped={true}
                      supportedLanguages={currentModelInfo.supported_languages}
                    />
                  ) : null}
                  {supportsTranslation ? (
                    <TranslateToEnglish
                      descriptionMode="inline"
                      grouped={true}
                    />
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
                    downloadBytes={getDownloadBytes(model.id)}
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
                    downloadBytes={getDownloadBytes(model.id)}
                    showRecommended={false}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState title={t("settings.models.noModelsMatch")} />
        )}
      </div>
      <ConfirmDialog
        open={modelPendingDelete !== null}
        title={t("settings.models.deleteTitle")}
        description={
          modelPendingDelete
            ? modelPendingDelete.isActive
              ? t("settings.models.deleteActiveConfirm", {
                  modelName: modelPendingDelete.name,
                })
              : t("settings.models.deleteConfirm", {
                  modelName: modelPendingDelete.name,
                })
            : ""
        }
        confirmLabel={t("settings.models.deleteConfirmAction")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void confirmModelDelete()}
        onCancel={() => setModelPendingDelete(null)}
      />
    </AppPage>
  );
};
