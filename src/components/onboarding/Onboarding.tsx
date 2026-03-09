import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { arch as getSystemArch, locale as getSystemLocale } from "@tauri-apps/plugin-os";
import { Check, Loader2, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { commands, type ModelInfo } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import {
  getOnboardingLocaleLabel,
  selectOnboardingModel,
} from "@/lib/utils/onboardingModel";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { useSettings } from "@/hooks/useSettings";
import { Textarea } from "@/components/ui";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";
import { Button } from "../ui/Button";
import Badge from "../ui/Badge";
import SilkScribeWordmark from "../icons/SilkScribeWordmark";
import OnboardingTipsRotator from "./OnboardingTipsRotator";
import { useModelStore } from "../../stores/modelStore";

interface OnboardingProps {
  onComplete: () => void;
}

type SetupState = "resolving" | "downloading" | "preparing" | "ready" | "error";
type OnboardingStage = "setup" | "trial";

const bytesToMb = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const mb = value / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
};

const formatEta = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
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
  const [stage, setStage] = useState<OnboardingStage>("setup");
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [activatedModelId, setActivatedModelId] = useState<string | null>(null);
  const [localeLabel, setLocaleLabel] = useState<string>(
    t("onboarding.setup.defaultLanguage"),
  );
  const [isSelectingModel, setIsSelectingModel] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [trialText, setTrialText] = useState("");
  const trialTimeoutRef = useRef<number | null>(null);

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
  const trialCompleted = trialText.trim().length > 0;

  const transcribeBinding =
    settings?.bindings?.transcribe?.current_binding?.trim() ?? "";
  const shortcutLabel = transcribeBinding
    ? formatKeyCombination(transcribeBinding, osType)
    : t("onboarding.trial.shortcutFallback");

  const setupState: SetupState = useMemo(() => {
    if (setupError) return "error";
    if (stage === "trial") return "ready";
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
    stage,
  ]);

  const advanceToTrial = useCallback(() => {
    if (trialTimeoutRef.current) {
      window.clearTimeout(trialTimeoutRef.current);
    }

    trialTimeoutRef.current = window.setTimeout(() => {
      setStage("trial");
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (trialTimeoutRef.current) {
        window.clearTimeout(trialTimeoutRef.current);
      }
    };
  }, []);

  const activateModel = useCallback(
    async (modelId: string) => {
      setIsSelectingModel(true);
      setSetupError(null);

      const success = await selectModel(modelId);
      setIsSelectingModel(false);

      if (!success) {
        setActivatedModelId(null);
        setSetupError(t("onboarding.errors.selectModel"));
        toast.error(t("onboarding.errors.selectModel"));
        return;
      }

      setActivatedModelId(modelId);
      advanceToTrial();
    },
    [advanceToTrial, selectModel, t],
  );

  useEffect(() => {
    if (stage !== "setup" || activeModelId || models.length === 0) return;

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
        const errorMessage = t("onboarding.errors.loadModels");
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
        setSetupError(t("onboarding.downloadFailed"));
        toast.error(t("onboarding.downloadFailed"));
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
    stage,
    t,
  ]);

  useEffect(() => {
    if (
      stage !== "setup" ||
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
    stage,
  ]);

  const handleRetrySetup = () => {
    setActiveModelId(null);
    setActivatedModelId(null);
    setSetupError(null);
    setIsSelectingModel(false);
    setSetupAttempt((current) => current + 1);
  };

  const handleFinish = async () => {
    setIsCompleting(true);

    try {
      const result = await commands.completeOnboarding();
      if (result.status === "error") {
        throw new Error(result.error);
      }
      onComplete();
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      toast.error(t("onboarding.trial.finishFailed"));
      setIsCompleting(false);
    }
  };

  const modelName = selectedModel
    ? getTranslatedModelName(selectedModel, t)
    : t("onboarding.setup.loadingModel");

  const showTipsRotator = isDownloadingModel || isExtractingModel;

  const renderProgressBar = () => {
    if (setupState === "preparing" || setupState === "resolving") {
      return (
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-ss-bg-elevated">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-ss-brand-secondary" />
        </div>
      );
    }

    return (
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-ss-bg-elevated">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ss-brand-secondary to-ss-brand-highlight transition-[width] duration-300"
          style={{
            width: `${Math.max(6, Math.min(100, progressPercentage))}%`,
          }}
        />
      </div>
    );
  };

  const renderSetup = () => (
    <div className="flex h-screen w-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[980px] rounded-[30px] border border-ss-border-subtle bg-ss-bg-surface/95 px-6 py-7 shadow-[var(--ss-shadow-lift)] backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="overflow-hidden rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-2 shadow-[var(--ss-shadow-card)]">
            <SilkScribeWordmark
              height={68}
              fit="cover"
              className="w-full"
              imageScale={1.71}
            />
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="h-2.5 w-8 rounded-full bg-ss-brand-highlight" />
            <span className="h-2.5 w-2.5 rounded-full bg-ss-brand-highlight/55" />
          </div>
          <h2 className="text-2xl font-semibold text-ss-text-primary">
            {t("onboarding.setup.title")}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-ss-text-tertiary">
            {t("onboarding.setup.description")}
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="rounded-[24px] border border-ss-border-default bg-ss-bg-surface p-5 shadow-[var(--ss-shadow-card)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ss-text-tertiary">
                  {t("onboarding.setup.selectedModelLabel")}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-ss-text-primary">
                  {modelName}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ss-text-tertiary">
                  {t("onboarding.setup.selectedForLanguage", {
                    language: localeLabel,
                  })}
                </p>
              </div>
              <Badge variant={setupState === "ready" ? "success" : "primary"}>
                {t(`onboarding.setup.states.${setupState}`)}
              </Badge>
            </div>

            {renderProgressBar()}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface-alt px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ss-text-tertiary">
                  {t("onboarding.setup.progressLabel")}
                </div>
                <div className="mt-1 text-sm font-semibold text-ss-text-primary">
                  {setupState === "preparing" || setupState === "resolving"
                    ? t("onboarding.setup.preparingDetail")
                    : `${Math.round(progressPercentage)}%`}
                </div>
              </div>

              <div className="rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface-alt px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ss-text-tertiary">
                  {t("onboarding.setup.sizeLabel")}
                </div>
                <div className="mt-1 text-sm font-semibold text-ss-text-primary">
                  {setupState === "preparing" || setupState === "resolving"
                    ? t("onboarding.setup.preparingDetail")
                    : `${bytesToMb(downloadedBytes)} / ${bytesToMb(totalBytes)}`}
                </div>
              </div>

              <div className="rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface-alt px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ss-text-tertiary">
                  {t("onboarding.setup.speedLabel")}
                </div>
                <div className="mt-1 text-sm font-semibold text-ss-text-primary">
                  {setupState === "downloading" && downloadSpeed
                    ? t("onboarding.setup.speedValue", {
                        speed: downloadSpeed.toFixed(
                          downloadSpeed >= 10 ? 0 : 1,
                        ),
                      })
                    : t("onboarding.setup.notAvailable")}
                </div>
              </div>

              <div className="rounded-[18px] border border-ss-border-subtle bg-ss-bg-surface-alt px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ss-text-tertiary">
                  {t("onboarding.setup.etaLabel")}
                </div>
                <div className="mt-1 text-sm font-semibold text-ss-text-primary">
                  {setupState === "downloading" && etaSeconds
                    ? formatEta(etaSeconds)
                    : t("onboarding.setup.notAvailable")}
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-ss-text-tertiary">
              {t("onboarding.setup.changeLater")}
            </p>

            {setupError && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[18px] border border-ss-state-danger/20 bg-ss-state-danger/8 px-4 py-3">
                <p className="text-sm text-ss-state-danger">{setupError}</p>
                <Button
                  onClick={handleRetrySetup}
                  size="sm"
                  variant="secondary"
                >
                  {t("onboarding.setup.retry")}
                </Button>
              </div>
            )}

            {setupState === "ready" && !setupError && (
              <div className="mt-4 flex items-center gap-2 rounded-[18px] border border-ss-brand-highlight/20 bg-ss-brand-highlight/10 px-4 py-3 text-sm font-medium text-ss-brand-highlight">
                <Check className="h-4 w-4" />
                {t("onboarding.setup.ready")}
              </div>
            )}
          </section>

          {showTipsRotator ? (
            <OnboardingTipsRotator shortcutLabel={shortcutLabel} />
          ) : (
            <section className="rounded-[24px] border border-ss-border-default bg-ss-bg-surface/90 p-5 shadow-[var(--ss-shadow-card)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-secondary/18 bg-ss-brand-secondary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ss-brand-secondary">
                <Wand2 className="h-3.5 w-3.5" />
                {t("onboarding.setup.almostThereBadge")}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-ss-text-primary">
                {t("onboarding.setup.almostThereTitle")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ss-text-tertiary">
                {t("onboarding.setup.almostThereDescription")}
              </p>
              <div className="mt-5 rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface-alt p-4">
                <p className="text-sm font-semibold text-ss-text-primary">
                  {t("onboarding.setup.shortcutPreviewTitle")}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ss-text-tertiary">
                  {t("onboarding.setup.shortcutPreviewBody", {
                    shortcut: shortcutLabel,
                  })}
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-ss-brand-highlight/20 bg-ss-brand-highlight/10 px-3 py-1.5 text-xs font-semibold text-ss-brand-highlight">
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {shortcutLabel}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  const renderTrial = () => (
    <div className="flex h-screen w-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[820px] rounded-[30px] border border-ss-border-subtle bg-ss-bg-surface/95 px-6 py-7 shadow-[var(--ss-shadow-lift)] backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="overflow-hidden rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-2 shadow-[var(--ss-shadow-card)]">
            <SilkScribeWordmark
              height={68}
              fit="cover"
              className="w-full"
              imageScale={1.71}
            />
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-ss-brand-highlight/45" />
            <span className="h-2.5 w-8 rounded-full bg-ss-brand-highlight" />
          </div>
          <h2 className="text-2xl font-semibold text-ss-text-primary">
            {t("onboarding.trial.title")}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-ss-text-tertiary">
            {t("onboarding.trial.description")}
          </p>
        </div>

        <div className="mt-6 rounded-[24px] border border-ss-border-default bg-ss-bg-surface p-5 shadow-[var(--ss-shadow-card)]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="primary">
              {t("onboarding.trial.pushToTalkBadge")}
            </Badge>
            <div className="inline-flex items-center gap-2 rounded-full border border-ss-brand-highlight/20 bg-ss-brand-highlight/10 px-3 py-1.5 text-xs font-semibold text-ss-brand-highlight">
              <span className="h-2 w-2 rounded-full bg-current" />
              {shortcutLabel}
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ss-text-secondary">
            {t("onboarding.trial.instructions", { shortcut: shortcutLabel })}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ss-text-tertiary">
            {t("onboarding.trial.helper")}
          </p>

          <div className="mt-5">
            <Textarea
              autoFocus
              value={trialText}
              onChange={(event) => setTrialText(event.target.value)}
              placeholder={t("onboarding.trial.placeholder")}
              className="min-h-[180px]"
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-6 text-sm text-ss-text-tertiary">
              {trialCompleted ? (
                <span className="inline-flex items-center gap-2 text-ss-brand-highlight">
                  <Check className="h-4 w-4" />
                  {t("onboarding.trial.success")}
                </span>
              ) : (
                t("onboarding.trial.prompt")
              )}
            </div>

            <Button
              onClick={handleFinish}
              variant="primary"
              size="lg"
              disabled={isCompleting}
            >
              {isCompleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("onboarding.trial.finishing")}
                </>
              ) : trialCompleted ? (
                t("onboarding.trial.finish")
              ) : (
                t("onboarding.trial.skip")
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return stage === "setup" ? renderSetup() : renderTrial();
};

export default Onboarding;
