import type { AppSettings } from "@/bindings";

/**
 * Whether a base URL points at this computer. Mirrors Rust's
 * `cleanup_runs_on_device` (text_context.rs), which decides what's sent.
 */
const isLocalUrl = (baseUrl: string): boolean => {
  const url = baseUrl.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
  let host = (url.split("://")[1] ?? url).split(/[/?]/)[0];
  const colon = host.lastIndexOf(":");
  if (colon >= 0 && /^\d*$/.test(host.slice(colon + 1)))
    host = host.slice(0, colon);
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

/** Whether this AI cleanup provider runs on this computer. */
export const isOnDeviceProvider = (
  providerId: string,
  baseUrl: string | null | undefined,
): boolean =>
  providerId === "apple_intelligence" ||
  (providerId === "custom" && isLocalUrl(baseUrl ?? ""));

/**
 * The cloud provider dictation text can go to, or null when nothing leaves
 * this computer: AI cleanup is off, or it runs on this computer. Meetings,
 * transcription and AI notes always run locally.
 */
export const cloudCleanupProvider = (
  settings: Pick<
    AppSettings,
    | "post_process_enabled"
    | "post_process_provider_id"
    | "post_process_providers"
  > | null,
): string | null => {
  if (!settings?.post_process_enabled) return null;
  const id = settings.post_process_provider_id ?? "";
  const provider = (settings.post_process_providers ?? []).find(
    (candidate) => candidate.id === id,
  );
  if (isOnDeviceProvider(id, provider?.base_url)) return null;
  return provider?.label || id || null;
};
