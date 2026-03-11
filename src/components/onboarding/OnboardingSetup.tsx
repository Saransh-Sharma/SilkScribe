import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arch as getSystemArch, locale as getSystemLocale } from "@tauri-apps/plugin-os";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { type ModelInfo } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import {
  getOnboardingLocaleLabel,
  selectOnboardingModel,
} from "@/lib/utils/onboardingModel";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";
import { Button } from "../ui/Button";
import OnboardingShell from "./OnboardingShell";

interface OnboardingSetupProps {
  onReady: () => void;
  stepLabels: string[];
  activeStep: number;
}

type SetupState = "resolving" | "downloading" | "preparing" | "ready" | "error";

const bytesToMb = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const mb = value / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
};

const formatEta = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const OnboardingSetup: React.FC<OnboardingSetupProps> = ({
  onReady,
  stepLabels,
  activeStep,
}) => {
  const { t } = useTranslation();
  const osType = useOsType();
  const {
    models,
    currentModel,
    downloadModel,
    downloadProgress,
    downloadStats,
    downloadingModels,
    extractingModels,
    selectModel,
  } = useModelStore();
  const { settings } = useSettings();

  const [setupAttempt, setSetupAttempt] = useState(0);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [activatedModelId, setActivatedModelId] = useState<string | null>(null);
  const [localeLabel, setLocaleLabel] = useState<string>(
    t("onboarding.setup.defaultLanguage"),
  );
  const [isSelectingModel, setIsSelectingModel] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const readyTimeoutRef = useRef<number | null>(null);

  const selectedModel = useMemo<ModelInfo | null>(
    () => models.find((model) => model.id === activeModelId) ?? null,
    [activeModelId, models],
  );
  const isDownloadingModel = Boolean(
    activeModelId && downloadingModels[activeModelId],
  );
  const isExtractingModel = Boolean(
    activeModelId && extractingModels[activeModelId],
  );
  const downloadSnapshot = activeModelId
    ? downloadProgress[activeModelId]
    : undefined;
  const downloadSpeed = activeModelId
    ? downloadStats[activeModelId]?.speed
    : undefined;

  const downloadedBytes =
    downloadSnapshot?.downloaded ?? selectedModel?.partial_size ?? 0;
  const totalBytes =
    downloadSnapshot?.total ??
    (selectedModel ? selectedModel.size_mb * 1024 * 1024 : 0);
  const progressPercentage =
    downloadSnapshot?.percentage ??
    (totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0);
  const etaSeconds =
    downloadSpeed && totalBytes > downloadedBytes
      ? (totalBytes - downloadedBytes) / (downloadSpeed * 1024 * 1024)
      : null;

  const transcribeBinding =
    settings?.bindings?.transcribe?.current_binding?.trim() ?? "";
  const shortcutLabel = transcribeBinding
    ? formatKeyCombination(transcribeBinding, osType)
    : t("onboarding.practice.shortcutFallback");

  const setupState: SetupState = useMemo(() => {
    if (setupError) return "error";
    if (
      selectedModel?.is_downloaded &&
      !isDownloadingModel &&
      !isExtractingModel
    ) {
      return activatedModelId === activeModelId ? "ready" : "preparing";
    }
    if (isSelectingModel || isExtractingModel) return "preparing";
    if (isDownloadingModel) return "downloading";
    return "resolving";
  }, [
    activatedModelId,
    activeModelId,
    isDownloadingModel,
    isExtractingModel,
    isSelectingModel,
    selectedModel,
    setupError,
  ]);

  const activateModel = useCallback(
    async (modelId: string) => {
      setIsSelectingModel(true);
      setSetupError(null);

      const success = await selectModel(modelId);
      setIsSelectingModel(false);

      if (!success) {
        setActivatedModelId(null);
        setSetupError(t("onboarding.setup.errors.selectModel"));
        toast.error(t("onboarding.setup.errors.selectModel"));
        return;
      }

      setActivatedModelId(modelId);
    },
    [selectModel, t],
  );

  useEffect(() => {
    return () => {
      if (readyTimeoutRef.current) {
        window.clearTimeout(readyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeModelId || models.length === 0) return;

    let isCancelled = false;

    const beginSetup = async () => {
      const systemLocale = await getSystemLocale().catch(() => null);
      const systemArch = (() => {
        try {
          return getSystemArch();
        } catch {
          return null;
        }
      })();
      if (isCancelled) return;

      setLocaleLabel(getOnboardingLocaleLabel(systemLocale));

      const model = selectOnboardingModel(models, currentModel, systemLocale, {
        osType,
        arch: systemArch,
      });
      if (!model) {
        const errorMessage = t("onboarding.setup.errors.loadModels");
        setSetupError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      setActivatedModelId(null);
      setActiveModelId(model.id);
      setSetupError(null);

      const alreadyInFlight =
        Boolean(downloadingModels[model.id]) ||
        Boolean(extractingModels[model.id]);

      if (model.is_downloaded || alreadyInFlight) {
        return;
      }

      const success = await downloadModel(model.id);
      if (!success && !isCancelled) {
        setSetupError(t("onboarding.setup.errors.downloadModel"));
        toast.error(t("onboarding.setup.errors.downloadModel"));
      }
    };

    void beginSetup();

    return () => {
      isCancelled = true;
    };
  }, [
    activeModelId,
    currentModel,
    downloadModel,
    downloadingModels,
    extractingModels,
    models,
    osType,
    setupAttempt,
    t,
  ]);

  useEffect(() => {
    if (
      !activeModelId ||
      activatedModelId === activeModelId ||
      !selectedModel?.is_downloaded ||
      isDownloadingModel ||
      isExtractingModel ||
      isSelectingModel ||
      setupError
    ) {
      return;
    }

    void activateModel(activeModelId);
  }, [
    activateModel,
    activeModelId,
    activatedModelId,
    isDownloadingModel,
    isExtractingModel,
    isSelectingModel,
    selectedModel,
    setupError,
  ]);

  useEffect(() => {
    if (setupState !== "ready") {
      if (readyTimeoutRef.current) {
        window.clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      return;
    }

    readyTimeoutRef.current = window.setTimeout(() => {
      readyTimeoutRef.current = null;
      onReady();
    }, 1600);

    return () => {
      if (readyTimeoutRef.current) {
        window.clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
    };
  }, [onReady, setupState]);

  const handleRetrySetup = () => {
    setActiveModelId(null);
    setActivatedModelId(null);
    setSetupError(null);
    setIsSelectingModel(false);
    setSetupAttempt((current) => current + 1);
  };

  const handleContinue = () => {
    if (readyTimeoutRef.current) {
      window.clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    onReady();
  };

  const footerContent =
    setupState === "error" ? (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm leading-relaxed text-ss-state-danger">
          {setupError ?? t("onboarding.setup.panelHelp.error")}
        </p>
        <Button
          onClick={handleRetrySetup}
          size="lg"
          variant="secondary"
          className="rounded-[18px]"
        >
          {t("onboarding.setup.retry")}
        </Button>
      </div>
    ) : setupState === "ready" ? (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm leading-relaxed text-ss-text-secondary">
          {t("onboarding.setup.ready")}
        </p>
        <Button
          onClick={handleContinue}
          size="lg"
          variant="primary"
          className="rounded-[18px] px-6"
        >
          {t("onboarding.permissions.shared.continue")}
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm leading-relaxed text-ss-text-secondary">
          {t(`onboarding.setup.panelHelp.${setupState}`)}
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-secondary/18 bg-ss-brand-secondary/10 px-4 py-2 text-sm font-semibold text-ss-brand-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t(`onboarding.setup.states.${setupState}`)}
        </div>
      </div>
    );

  return (
    <OnboardingShell
      stepLabels={stepLabels}
      activeStep={activeStep}
      eyebrow={t("onboarding.setup.eyebrow")}
      title={t("onboarding.setup.title")}
      description={t("onboarding.setup.description", { language: localeLabel })}
      compactHeader
      footer={footerContent}
    >
      <div className="h-full">
        <section className="flex h-full flex-col rounded-[28px] border border-ss-border-default bg-ss-bg-surface/94 p-6 shadow-[var(--ss-shadow-card)]">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-highlight/20 bg-ss-brand-highlight/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ss-brand-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {t("onboarding.setup.autoLabel")}
              </div>
              <p className="mt-5 text-2xl font-semibold leading-tight text-ss-text-primary">
                {t("onboarding.setup.engineTitle")}
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ss-text-secondary">
                {t("onboarding.setup.engineBody", { language: localeLabel })}
              </p>
            </div>

            <div className="rounded-[22px] border border-ss-brand-secondary/20 bg-ss-brand-secondary/10 px-4 py-3 text-sm font-semibold text-ss-brand-secondary">
              {t(`onboarding.setup.states.${setupState}`)}
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-ss-border-subtle bg-ss-bg-surface-alt/88 p-5">
            <div className="overflow-hidden rounded-full bg-ss-bg-surface">
              <div
                className={`ss-onboarding-progress-bar h-4 rounded-full ${
                  setupState === "ready" ? "bg-ss-brand-primary" : ""
                }`}
                style={{
                  width:
                    setupState === "resolving" || setupState === "preparing"
                      ? "42%"
                      : `${Math.max(8, Math.min(100, progressPercentage))}%`,
                }}
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ss-text-tertiary">
                  {t("onboarding.setup.progressLabel")}
                </p>
                <p className="mt-1.5 text-base font-semibold text-ss-text-primary">
                  {setupState === "preparing" || setupState === "resolving"
                    ? t("onboarding.setup.preparingDetail")
                    : `${Math.round(progressPercentage)}%`}
                </p>
              </div>

              <div className="rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ss-text-tertiary">
                  {t("onboarding.setup.sizeLabel")}
                </p>
                <p className="mt-1.5 text-base font-semibold text-ss-text-primary">
                  {setupState === "preparing" || setupState === "resolving"
                    ? t("onboarding.setup.preparingDetail")
                    : `${bytesToMb(downloadedBytes)} / ${bytesToMb(totalBytes)}`}
                </p>
              </div>

              <div className="rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ss-text-tertiary">
                  {t("onboarding.setup.speedLabel")}
                </p>
                <p className="mt-1.5 text-base font-semibold text-ss-text-primary">
                  {setupState === "downloading" && downloadSpeed
                    ? t("onboarding.setup.speedValue", {
                        speed: downloadSpeed.toFixed(downloadSpeed >= 10 ? 0 : 1),
                      })
                    : t("onboarding.setup.notAvailable")}
                </p>
              </div>

              <div className="rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ss-text-tertiary">
                  {t("onboarding.setup.etaLabel")}
                </p>
                <p className="mt-1.5 text-base font-semibold text-ss-text-primary">
                  {setupState === "downloading" && etaSeconds
                    ? formatEta(etaSeconds)
                    : t("onboarding.setup.notAvailable")}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-[24px] border border-ss-border-subtle bg-ss-bg-surface-alt/88 p-5">
              <p className="text-sm font-semibold text-ss-text-primary">
                {t("onboarding.setup.shortcutTitle")}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ss-text-secondary">
                {t("onboarding.setup.shortcutBody", { shortcut: shortcutLabel })}
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-ss-brand-highlight/24 bg-ss-brand-highlight/12 px-4 py-2 text-sm font-semibold text-ss-brand-primary">
                <span className="h-2.5 w-2.5 rounded-full bg-current" />
                {shortcutLabel}
              </div>
            </div>

            <div className="rounded-[24px] border border-ss-brand-secondary/18 bg-ss-brand-secondary/8 p-5">
              <div className="flex items-center gap-3">
                {setupState === "ready" ? (
                  <div className="ss-onboarding-success-ring flex h-10 w-10 items-center justify-center rounded-full bg-ss-brand-primary text-ss-brand-primary-ink">
                    <Check className="h-[18px] w-[18px]" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ss-brand-secondary/12 text-ss-brand-secondary">
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  </div>
                )}
                <p className="text-sm font-semibold text-ss-text-primary">
                  {t(`onboarding.setup.panelStates.${setupState}`)}
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ss-text-secondary">
                {t(`onboarding.setup.panelHelp.${setupState}`)}
              </p>
            </div>
          </div>
        </section>
      </div>
    </OnboardingShell>
  );
};

export default OnboardingSetup;
