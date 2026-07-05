export type DownloadErrorCode =
  | "preflight_failed"
  | "insufficient_space"
  | "download_failed"
  | "extraction_failed"
  | "unknown";

export interface DownloadError {
  modelId: string;
  code: DownloadErrorCode;
  detail?: string;
  requiredBytes?: number;
  freeBytes?: number;
}

export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 MB";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
};
