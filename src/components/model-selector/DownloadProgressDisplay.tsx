import React from "react";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "@/bindings";
import { Button } from "@/components/ui/Button";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";
import { formatBytes, type DownloadError } from "@/lib/utils/download";

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

interface DownloadStats {
  startTime: number;
  lastUpdate: number;
  totalDownloaded: number;
  speed: number;
}

interface DownloadProgressDisplayProps {
  models: ModelInfo[];
  downloadProgress: Record<string, DownloadProgress>;
  downloadStats: Record<string, DownloadStats>;
  extractingModels?: Record<string, true>;
  downloadErrors?: Record<string, DownloadError>;
  className?: string;
  onCancel?: (modelId: string) => void;
  onRetry?: (modelId: string) => void;
}

const formatEta = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const DownloadProgressDisplay: React.FC<DownloadProgressDisplayProps> = ({
  models,
  downloadProgress,
  downloadStats,
  extractingModels = {},
  downloadErrors = {},
  className = "",
  onCancel,
  onRetry,
}) => {
  const { t } = useTranslation();
  const progressValues = Object.values(downloadProgress);
  const extractingIds = Object.keys(extractingModels);
  const errorValues = Object.values(downloadErrors);

  if (
    progressValues.length === 0 &&
    extractingIds.length === 0 &&
    errorValues.length === 0
  ) {
    return null;
  }

  const modelName = (modelId: string) => {
    const model = models.find((candidate) => candidate.id === modelId);
    return model ? getTranslatedModelName(model, t) : modelId;
  };

  const describeDownloadError = (error: DownloadError) => {
    switch (error.code) {
      case "preflight_failed":
        return t("modelSelector.downloadErrors.preflightFailed", {
          detail: error.detail ?? t("modelSelector.downloadErrors.unknown"),
        });
      case "insufficient_space":
        return t("modelSelector.downloadErrors.insufficientSpace", {
          required: formatBytes(error.requiredBytes ?? 0),
          available: formatBytes(error.freeBytes ?? 0),
        });
      case "download_failed":
        return t("modelSelector.downloadErrors.downloadFailed", {
          detail: error.detail ?? t("modelSelector.downloadErrors.unknown"),
        });
      case "extraction_failed":
        return t("modelSelector.downloadErrors.extractionFailed", {
          detail: error.detail ?? t("modelSelector.downloadErrors.unknown"),
        });
      default:
        return t("modelSelector.downloadErrors.unknown");
    }
  };

  return (
    <div
      className={`min-w-[280px] max-w-[360px] space-y-2 rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface px-3 py-3 shadow-[var(--ss-shadow-card)] ${className}`}
    >
      {progressValues.map((progress) => {
        const stats = downloadStats[progress.model_id];
        const percentage = Math.max(
          0,
          Math.min(100, Math.round(progress.percentage)),
        );
        const remainingBytes = Math.max(
          0,
          progress.total - progress.downloaded,
        );
        const etaSeconds =
          stats?.speed && stats.speed > 0
            ? remainingBytes / (stats.speed * 1024 * 1024)
            : 0;
        const eta = formatEta(etaSeconds);

        return (
          <div key={progress.model_id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ss-text-primary">
                  {modelName(progress.model_id)}
                </p>
                <p className="mt-0.5 text-xs text-ss-text-tertiary">
                  {progress.total > 0
                    ? t("modelSelector.downloadProgress.downloadedOf", {
                        downloaded: formatBytes(progress.downloaded),
                        total: formatBytes(progress.total),
                      })
                    : t("modelSelector.downloadProgress.starting")}
                </p>
              </div>
              {onCancel ? (
                <button
                  type="button"
                  onClick={() => onCancel(progress.model_id)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ss-text-tertiary transition-colors hover:bg-ss-state-danger/10 hover:text-ss-state-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
                  title={t("modelSelector.cancelDownload")}
                  aria-label={t("modelSelector.cancelDownload")}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ss-bg-surface-alt">
              <div
                className="h-full rounded-full bg-ss-action-primary transition-[width] duration-200"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ss-text-tertiary">
              <span>{percentage}%</span>
              {stats?.speed ? (
                <span>
                  {t("modelSelector.downloadProgress.speed", {
                    speed: formatBytes(stats.speed * 1024 * 1024),
                  })}
                </span>
              ) : null}
              <span>
                {eta
                  ? t("modelSelector.downloadProgress.eta", { eta })
                  : t("modelSelector.downloadProgress.unknownEta")}
              </span>
            </div>
          </div>
        );
      })}

      {extractingIds.map((modelId) => (
        <div key={modelId} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ss-text-primary">
                {modelName(modelId)}
              </p>
              <p className="mt-0.5 text-xs text-ss-text-tertiary">
                {t("modelSelector.downloadProgress.extracting")}
              </p>
            </div>
            <span className="text-[11px] font-semibold text-ss-text-tertiary">
              {t("modelSelector.downloadProgress.almostDone")}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-ss-bg-surface-alt">
            <div className="absolute inset-y-0 w-1/2 rounded-full bg-ss-action-primary/85 animate-[ss-progress-indeterminate_1.2s_cubic-bezier(0.4,0,0.2,1)_infinite]" />
          </div>
        </div>
      ))}

      {errorValues.map((downloadError) => (
        <div
          key={downloadError.modelId}
          className="rounded-[var(--ss-radius-md)] border border-ss-state-danger/20 bg-ss-state-danger/10 px-3 py-2"
        >
          <div className="flex items-start gap-2">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-ss-state-danger"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ss-text-primary">
                {t("modelSelector.downloadErrorTitle")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ss-text-tertiary">
                {describeDownloadError(downloadError)}
              </p>
              {onRetry ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2 min-h-8 px-2"
                  onClick={() => onRetry(downloadError.modelId)}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("modelSelector.retryDownload")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DownloadProgressDisplay;
