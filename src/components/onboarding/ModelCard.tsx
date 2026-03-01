import React from "react";
import {
  Check,
  Download,
  Globe,
  Languages,
  Loader2,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/bindings";
import { LANGUAGES } from "../../lib/constants/languages";
import { formatModelSize } from "../../lib/utils/format";
import {
  getTranslatedModelDescription,
  getTranslatedModelName,
} from "../../lib/utils/modelTranslation";
import Badge from "../ui/Badge";
import { Button } from "../ui/Button";

const getLanguageDisplayText = (
  supportedLanguages: string[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  if (supportedLanguages.length === 1) {
    const langCode = supportedLanguages[0];
    const langName =
      LANGUAGES.find((language) => language.value === langCode)?.label ||
      langCode;
    return t("modelSelector.capabilities.languageOnly", { language: langName });
  }

  return t("modelSelector.capabilities.multiLanguage");
};

export type ModelCardStatus =
  | "downloadable"
  | "downloading"
  | "extracting"
  | "switching"
  | "active"
  | "available";

type ModelCardLayout = "onboarding" | "settings";

interface ModelCardProps {
  model: ModelInfo;
  variant?: "default" | "featured";
  layout?: ModelCardLayout;
  status?: ModelCardStatus;
  disabled?: boolean;
  className?: string;
  onSelect: (modelId: string) => void;
  onDownload?: (modelId: string) => void;
  onDelete?: (modelId: string) => void;
  onCancel?: (modelId: string) => void;
  downloadProgress?: number;
  downloadSpeed?: number;
  showRecommended?: boolean;
}

interface MetricItemProps {
  label: string;
  value: number;
  fillClassName: string;
  dense?: boolean;
}

const MetricItem: React.FC<MetricItemProps> = ({
  label,
  value,
  fillClassName,
  dense = false,
}) => {
  const clampedValue = Math.max(0, Math.min(100, value * 100));

  return (
    <div
      className={`rounded-[14px] border border-ss-border-subtle bg-ss-bg-surface-alt ${dense ? "px-2.5 py-2" : "px-3 py-2.5"}`}
    >
      <div
        className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ss-text-tertiary ${dense ? "" : "leading-none"}`}
      >
        {label}
      </div>
      <div
        className={`overflow-hidden rounded-full bg-ss-bg-elevated ${dense ? "h-1.5" : "h-1.5"}`}
      >
        <div
          className={`h-full rounded-full ${fillClassName}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
};

interface MetadataChipProps {
  icon: React.ReactNode;
  label: string;
  title?: string;
}

const MetadataChip: React.FC<MetadataChipProps> = ({ icon, label, title }) => (
  <div
    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-1 text-xs text-ss-text-tertiary"
    title={title}
  >
    <span className="shrink-0">{icon}</span>
    <span className="truncate">{label}</span>
  </div>
);

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  variant = "default",
  layout = "settings",
  status = "downloadable",
  disabled = false,
  className = "",
  onSelect,
  onDownload,
  onDelete,
  onCancel,
  downloadProgress,
  downloadSpeed,
  showRecommended = true,
}) => {
  const { t } = useTranslation();
  const isOnboardingLayout = layout === "onboarding";
  const isFeatured = variant === "featured";
  const isClickable =
    status === "available" || status === "active" || status === "downloadable";
  const isCardInteractive = !isOnboardingLayout && isClickable;
  const isProgressState = status === "downloading" || status === "extracting";
  const isVisuallyDisabled = disabled && !isProgressState;
  const hasMetrics = model.accuracy_score > 0 || model.speed_score > 0;
  const languageLabel =
    model.supported_languages.length > 0
      ? getLanguageDisplayText(model.supported_languages, t)
      : null;
  const displayName = getTranslatedModelName(model, t);
  const displayDescription = getTranslatedModelDescription(model, t);

  const handlePrimaryAction = () => {
    if (disabled) return;

    if (status === "downloadable" && onDownload) {
      onDownload(model.id);
      return;
    }

    onSelect(model.id);
  };

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onDelete?.(model.id);
  };

  const handleCancel = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onCancel?.(model.id);
  };

  const handleOnboardingButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    handlePrimaryAction();
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isCardInteractive || disabled) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlePrimaryAction();
    }
  };

  const getRootClasses = () => {
    const baseClasses =
      "group relative flex flex-col rounded-[18px] border text-left transition-[transform,background-color,border-color,box-shadow,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/40";
    const sizeClasses = isOnboardingLayout
      ? `${isFeatured ? "min-h-[168px]" : "min-h-[152px]"} gap-4 px-[18px] py-[18px] shadow-[var(--ss-shadow-card)]`
      : "min-h-[112px] gap-3 px-4 py-4";
    const surfaceClasses =
      status === "active"
        ? "border-ss-brand-secondary/55 bg-ss-brand-secondary/10 shadow-[var(--ss-shadow-lift)]"
        : isFeatured
          ? "border-ss-brand-secondary/28 bg-gradient-to-br from-ss-brand-secondary/7 via-ss-bg-surface to-ss-brand-highlight/10"
          : "border-ss-border-default bg-ss-bg-surface";
    const stateClasses = isVisuallyDisabled
      ? "opacity-60"
      : isCardInteractive
        ? "cursor-pointer hover:-translate-y-0.5 hover:border-ss-brand-secondary/35 hover:bg-ss-bg-elevated hover:shadow-[var(--ss-shadow-lift)] active:translate-y-0 active:scale-[0.995]"
        : "cursor-default hover:-translate-y-0.5 hover:shadow-[var(--ss-shadow-lift)]";

    return [baseClasses, sizeClasses, surfaceClasses, stateClasses, className]
      .filter(Boolean)
      .join(" ");
  };

  const renderBadges = () => {
    const badges: React.ReactNode[] = [];

    if (showRecommended && model.is_recommended) {
      badges.push(
        <Badge key="recommended" variant="primary" tone="accent">
          {t("onboarding.recommended")}
        </Badge>,
      );
    }

    if (status === "active") {
      badges.push(
        <Badge key="active" variant="primary" tone="accent">
          <Check className="mr-1 h-3 w-3" />
          {t("modelSelector.active")}
        </Badge>,
      );
    }

    if (model.is_custom) {
      badges.push(
        <Badge key="custom" variant="secondary">
          {t("modelSelector.custom")}
        </Badge>,
      );
    }

    if (status === "switching") {
      badges.push(
        <Badge key="switching" variant="secondary">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          {t("modelSelector.switching")}
        </Badge>,
      );
    }

    if (badges.length === 0) {
      return null;
    }

    return <div className="flex flex-wrap items-center gap-2">{badges}</div>;
  };

  const renderMetrics = () => {
    if (!hasMetrics) {
      return null;
    }

    return (
      <div
        className={`grid gap-2 ${isOnboardingLayout ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}
      >
        <MetricItem
          label={t("onboarding.modelCard.accuracy")}
          value={model.accuracy_score}
          fillClassName="bg-ss-brand-highlight"
          dense={!isOnboardingLayout}
        />
        <MetricItem
          label={t("onboarding.modelCard.speed")}
          value={model.speed_score}
          fillClassName="bg-ss-brand-secondary"
          dense={!isOnboardingLayout}
        />
      </div>
    );
  };

  const renderMetadata = () => {
    if (!languageLabel && !model.supports_translation) {
      return null;
    }

    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {languageLabel && (
          <MetadataChip
            icon={<Globe className="h-3.5 w-3.5" />}
            label={languageLabel}
            title={
              model.supported_languages.length === 1
                ? t("modelSelector.capabilities.singleLanguage")
                : t("modelSelector.capabilities.languageSelection")
            }
          />
        )}
        {model.supports_translation && (
          <MetadataChip
            icon={<Languages className="h-3.5 w-3.5" />}
            label={t("modelSelector.capabilities.translate")}
            title={t("modelSelector.capabilities.translation")}
          />
        )}
      </div>
    );
  };

  const renderProgress = () => {
    if (!isProgressState) {
      return null;
    }

    if (status === "downloading") {
      const safeProgress = Math.max(0, Math.min(100, downloadProgress ?? 0));

      return (
        <div
          className={`w-full rounded-[14px] border border-ss-border-subtle bg-ss-bg-surface-alt ${isOnboardingLayout ? "px-3 py-3" : "px-3 py-2.5"}`}
        >
          <div className="h-2 w-full overflow-hidden rounded-full bg-ss-bg-elevated">
            <div
              className="h-full rounded-full bg-gradient-to-r from-ss-brand-highlight to-ss-brand-secondary transition-all duration-300"
              style={{ width: `${safeProgress}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ss-text-tertiary">
            <span>
              {t("modelSelector.downloading", {
                percentage: Math.round(safeProgress),
              })}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {downloadSpeed !== undefined && downloadSpeed > 0 && (
                <span className="tabular-nums">
                  {t("modelSelector.downloadSpeed", {
                    speed: downloadSpeed.toFixed(1),
                  })}
                </span>
              )}
              {onCancel && !isOnboardingLayout && (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={handleCancel}
                  aria-label={t("modelSelector.cancelDownload")}
                >
                  {t("modelSelector.cancel")}
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`w-full rounded-[14px] border border-ss-border-subtle bg-ss-bg-surface-alt ${isOnboardingLayout ? "px-3 py-3" : "px-3 py-2.5"}`}
      >
        <div className="h-2 w-full overflow-hidden rounded-full bg-ss-bg-elevated">
          <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-ss-brand-highlight to-ss-brand-secondary" />
        </div>
        <p className="mt-2 text-xs text-ss-text-tertiary">
          {t("modelSelector.extractingGeneric")}
        </p>
      </div>
    );
  };

  const renderOnboardingAction = () => {
    let label = t("onboarding.download");
    let icon: React.ReactNode = <Download className="h-4 w-4" />;
    let buttonVariant: "primary" | "secondary" = "primary";
    let buttonDisabled = disabled;

    if (status === "downloading") {
      label = t("onboarding.downloading");
      icon = <Loader2 className="h-4 w-4 animate-spin" />;
      buttonVariant = "secondary";
      buttonDisabled = true;
    } else if (status === "extracting") {
      label = t("modelSelector.extractingGeneric");
      icon = <Loader2 className="h-4 w-4 animate-spin" />;
      buttonVariant = "secondary";
      buttonDisabled = true;
    } else if (status === "active") {
      label = t("modelSelector.active");
      icon = <Check className="h-4 w-4" />;
      buttonVariant = "secondary";
      buttonDisabled = true;
    }

    return (
      <Button
        variant={buttonVariant}
        size="md"
        onClick={handleOnboardingButtonClick}
        disabled={buttonDisabled}
        className="min-h-11 min-w-[104px] justify-center disabled:opacity-100"
      >
        {icon}
        <span>{label}</span>
      </Button>
    );
  };

  return (
    <div
      onClick={isCardInteractive ? handlePrimaryAction : undefined}
      onKeyDown={handleCardKeyDown}
      role={isCardInteractive ? "button" : undefined}
      tabIndex={isCardInteractive ? 0 : undefined}
      className={getRootClasses()}
    >
      {status === "active" && (
        <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-ss-brand-highlight to-ss-brand-secondary" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={`line-clamp-2 text-left font-semibold leading-snug text-ss-text-primary transition-colors ${isOnboardingLayout ? "text-[17px]" : `text-base ${isCardInteractive ? "group-hover:text-ss-brand-secondary" : ""}`}`}
          >
            {displayName}
          </h3>
          <div className="mt-2">{renderBadges()}</div>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-1 text-xs font-semibold text-ss-text-secondary">
          {formatModelSize(Number(model.size_mb))}
        </span>
      </div>

      <p
        className={`line-clamp-2 text-sm leading-relaxed text-ss-text-secondary ${isOnboardingLayout ? "min-h-[2.75rem]" : ""}`}
      >
        {displayDescription}
      </p>

      {renderMetrics()}

      {isOnboardingLayout ? (
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          {renderMetadata()}
          <div className="shrink-0">{renderOnboardingAction()}</div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          {renderMetadata()}
          <div className="flex shrink-0 items-center gap-2">
            {status === "downloadable" && (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ss-border-subtle bg-ss-bg-surface-alt px-2.5 py-1 text-xs text-ss-text-tertiary">
                <Download className="h-3.5 w-3.5" />
                <span>{t("onboarding.download")}</span>
              </span>
            )}
            {onDelete && (status === "available" || status === "active") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                title={t("modelSelector.deleteModel", {
                  modelName: displayName,
                })}
                className="text-ss-text-tertiary hover:text-ss-brand-secondary"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t("common.delete")}</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {renderProgress()}
    </div>
  );
};

export default ModelCard;
