import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "./ModelCard";
import ModelCard from "./ModelCard";
import SilkScribeWordmark from "../icons/SilkScribeWordmark";
import { useModelStore } from "../../stores/modelStore";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onModelSelected }) => {
  const { t } = useTranslation();
  const {
    models,
    downloadModel,
    selectModel,
    downloadingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
  } = useModelStore();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const isDownloading = selectedModelId !== null;

  // Watch for the selected model to finish downloading + extracting
  useEffect(() => {
    if (!selectedModelId) return;

    const model = models.find((m) => m.id === selectedModelId);
    const stillDownloading = selectedModelId in downloadingModels;
    const stillExtracting = selectedModelId in extractingModels;

    if (model?.is_downloaded && !stillDownloading && !stillExtracting) {
      // Model is ready — select it and transition
      selectModel(selectedModelId).then((success) => {
        if (success) {
          onModelSelected();
        } else {
          toast.error(t("onboarding.errors.selectModel"));
          setSelectedModelId(null);
        }
      });
    }
  }, [
    selectedModelId,
    models,
    downloadingModels,
    extractingModels,
    selectModel,
    onModelSelected,
  ]);

  const handleDownloadModel = async (modelId: string) => {
    setSelectedModelId(modelId);

    const success = await downloadModel(modelId);
    if (!success) {
      toast.error(t("onboarding.downloadFailed"));
      setSelectedModelId(null);
    }
  };

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in downloadingModels) return "downloading";
    return "downloadable";
  };

  const getModelDownloadProgress = (modelId: string): number | undefined => {
    return downloadProgress[modelId]?.percentage;
  };

  const getModelDownloadSpeed = (modelId: string): number | undefined => {
    return downloadStats[modelId]?.speed;
  };

  const availableModels = models.filter((model: ModelInfo) => !model.is_downloaded);
  const recommendedModels = availableModels.filter(
    (model: ModelInfo) => model.is_recommended,
  );
  const standardModels = availableModels
    .filter((model: ModelInfo) => !model.is_recommended)
    .sort(
      (a: ModelInfo, b: ModelInfo) => Number(a.size_mb) - Number(b.size_mb),
    );

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[760px] rounded-[28px] border border-ss-border-subtle bg-ss-bg-surface/95 px-6 py-7 shadow-[var(--ss-shadow-lift)] backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt px-5 py-4 shadow-[var(--ss-shadow-card)]">
            <SilkScribeWordmark width={190} />
          </div>
          <p className="mx-auto max-w-lg text-sm font-medium leading-relaxed text-ss-text-tertiary">
            {t("onboarding.subtitle")}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="h-2.5 w-8 rounded-full bg-ss-brand-highlight" />
          <span className="h-2.5 w-2.5 rounded-full bg-ss-border-default" />
          <span className="h-2.5 w-2.5 rounded-full bg-ss-border-default" />
        </div>

        <div className="mt-6 max-h-[60vh] space-y-5 overflow-y-auto pe-1">
          {recommendedModels.length > 0 && (
            <div className="space-y-3">
              {recommendedModels.map((model: ModelInfo) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  layout="onboarding"
                  variant="featured"
                  status={getModelStatus(model.id)}
                  disabled={isDownloading}
                  onSelect={handleDownloadModel}
                  onDownload={handleDownloadModel}
                  downloadProgress={getModelDownloadProgress(model.id)}
                  downloadSpeed={getModelDownloadSpeed(model.id)}
                />
              ))}
            </div>
          )}

          {standardModels.length > 0 && (
            <div className="space-y-3">
              {standardModels.map((model: ModelInfo) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  layout="onboarding"
                  status={getModelStatus(model.id)}
                  disabled={isDownloading}
                  onSelect={handleDownloadModel}
                  onDownload={handleDownloadModel}
                  downloadProgress={getModelDownloadProgress(model.id)}
                  downloadSpeed={getModelDownloadSpeed(model.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
