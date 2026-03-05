import type { ModelInfo } from "@/bindings";
import { LANGUAGES } from "@/lib/constants/languages";
import type { OSType } from "@/lib/utils/keyboard";

const SPECIAL_LOCALE_MODEL_MAP = new Map<string, string>([
  ["zh-tw", "breeze-asr"],
  ["zh-hk", "breeze-asr"],
  ["zh-hant", "breeze-asr"],
]);

const EAST_ASIAN_LANGUAGE_MODEL_MAP = new Set(["zh", "yue", "ja", "ko"]);

export interface OnboardingRuntimeContext {
  osType?: OSType | null;
  arch?: string | null;
}

const normalizeLocale = (locale: string | null | undefined): string | null => {
  if (!locale) return null;
  const normalized = locale.replace(/_/g, "-").trim();
  return normalized.length > 0 ? normalized : null;
};

const getLocalePrefix = (locale: string | null): string | null => {
  if (!locale) return null;
  return locale.split("-")[0]?.toLowerCase() || null;
};

const isAppleSiliconEnglishLocale = (
  locale: string | null | undefined,
  context?: OnboardingRuntimeContext,
): boolean => {
  const normalized = normalizeLocale(locale);
  const prefix = getLocalePrefix(normalized);
  const osType = context?.osType ?? null;
  const arch = context?.arch?.toLowerCase() ?? null;

  return (
    prefix === "en" &&
    osType === "macos" &&
    (arch === "aarch64" || arch === "arm64")
  );
};

const getLocaleLanguageCandidates = (
  locale: string | null | undefined,
): string[] => {
  const normalized = normalizeLocale(locale);
  if (!normalized) return [];

  const lower = normalized.toLowerCase();
  const prefix = getLocalePrefix(normalized);
  const candidates: string[] = [lower];

  if (lower.startsWith("zh-tw") || lower.startsWith("zh-hk")) {
    candidates.push("zh-hant");
  }

  if (lower.startsWith("zh-cn") || lower.startsWith("zh-sg")) {
    candidates.push("zh-hans");
  }

  if (prefix && !candidates.includes(prefix)) {
    candidates.push(prefix);
  }

  return candidates;
};

const getLocaleTargetModelId = (
  locale: string | null | undefined,
  models: ModelInfo[],
): string => {
  const normalized = normalizeLocale(locale);
  const lower = normalized?.toLowerCase() ?? null;
  const prefix = getLocalePrefix(normalized);
  const parakeetV3 = models.find(
    (model) => model.id === "parakeet-tdt-0.6b-v3",
  );

  if (!lower || !prefix) {
    return "small";
  }

  if (prefix === "en") {
    return "parakeet-tdt-0.6b-v2";
  }

  const specialModel = SPECIAL_LOCALE_MODEL_MAP.get(lower);
  if (specialModel) {
    return specialModel;
  }

  if (EAST_ASIAN_LANGUAGE_MODEL_MAP.has(prefix)) {
    return "sense-voice-int8";
  }

  if (parakeetV3?.supported_languages.includes(prefix)) {
    return "parakeet-tdt-0.6b-v3";
  }

  return "small";
};

const modelSupportsLocale = (
  model: ModelInfo,
  locale: string | null | undefined,
): boolean => {
  const supported = new Set(
    model.supported_languages.map((lang) => lang.toLowerCase()),
  );
  return getLocaleLanguageCandidates(locale).some((candidate) =>
    supported.has(candidate),
  );
};

const findModelById = (
  models: ModelInfo[],
  modelId: string,
): ModelInfo | null => models.find((model) => model.id === modelId) ?? null;

export const getOnboardingLocaleLabel = (
  locale: string | null | undefined,
): string => {
  const normalized = normalizeLocale(locale);
  if (!normalized) return "your language";

  const candidates = getLocaleLanguageCandidates(normalized);
  for (const candidate of candidates) {
    const language = LANGUAGES.find(
      (entry) => entry.value.toLowerCase() === candidate.toLowerCase(),
    );
    if (language) {
      return language.label;
    }
  }

  return normalized;
};

export const selectOnboardingModel = (
  models: ModelInfo[],
  currentModelId: string,
  locale: string | null | undefined,
  runtimeContext?: OnboardingRuntimeContext,
): ModelInfo | null => {
  if (models.length === 0) return null;

  if (isAppleSiliconEnglishLocale(locale, runtimeContext)) {
    const parakeetV3 = findModelById(models, "parakeet-tdt-0.6b-v3");
    if (parakeetV3) {
      return parakeetV3;
    }
  }

  const currentModel = findModelById(models, currentModelId);
  if (currentModel?.is_downloaded) {
    return currentModel;
  }

  const targetModelId = getLocaleTargetModelId(locale, models);
  const targetModel = findModelById(models, targetModelId);
  if (targetModel?.is_downloaded) {
    return targetModel;
  }

  const downloadedLocaleMatches = models
    .filter(
      (model) => model.is_downloaded && modelSupportsLocale(model, locale),
    )
    .sort((a, b) => a.size_mb - b.size_mb);

  if (downloadedLocaleMatches.length > 0) {
    return downloadedLocaleMatches[0];
  }

  if (targetModel) {
    return targetModel;
  }

  return findModelById(models, "small") ?? models[0] ?? null;
};
