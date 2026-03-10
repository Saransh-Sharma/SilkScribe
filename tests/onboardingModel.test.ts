import { describe, expect, test } from "bun:test";
import type { ModelInfo } from "../src/bindings";
import { selectOnboardingModel } from "../src/lib/utils/onboardingModel";

const createModel = (
  id: string,
  options: Partial<ModelInfo> = {},
): ModelInfo => ({
  id,
  name: id,
  description: `${id} description`,
  filename: `${id}.bin`,
  url: null,
  size_mb: 100,
  is_downloaded: false,
  is_downloading: false,
  partial_size: 0,
  is_directory: false,
  engine_type: "Whisper",
  accuracy_score: 0.5,
  speed_score: 0.5,
  supports_translation: false,
  is_recommended: false,
  supported_languages: [],
  is_custom: false,
  ...options,
});

describe("selectOnboardingModel", () => {
  test("defaults to Parakeet V3 on macOS even when small is already selected", () => {
    const small = createModel("small", {
      is_downloaded: true,
      supported_languages: ["en"],
    });
    const parakeetV3 = createModel("parakeet-tdt-0.6b-v3", {
      engine_type: "Parakeet",
      supported_languages: ["en", "fr"],
    });

    const model = selectOnboardingModel(
      [small, parakeetV3],
      "small",
      "en-US",
      { osType: "macos", arch: "arm64" },
    );

    expect(model?.id).toBe("parakeet-tdt-0.6b-v3");
  });

  test("defaults to Parakeet V3 on macOS for unsupported locales", () => {
    const small = createModel("small", {
      is_downloaded: true,
      supported_languages: ["hi", "en"],
    });
    const parakeetV3 = createModel("parakeet-tdt-0.6b-v3", {
      engine_type: "Parakeet",
      supported_languages: ["en", "fr"],
    });

    const model = selectOnboardingModel(
      [small, parakeetV3],
      "small",
      "hi-IN",
      { osType: "macos", arch: "x86_64" },
    );

    expect(model?.id).toBe("parakeet-tdt-0.6b-v3");
  });

  test("returns Parakeet V3 on macOS even when it still needs downloading", () => {
    const small = createModel("small", {
      is_downloaded: true,
      supported_languages: ["en"],
    });
    const parakeetV3 = createModel("parakeet-tdt-0.6b-v3", {
      engine_type: "Parakeet",
      is_directory: true,
      is_downloaded: false,
      supported_languages: ["en", "fr"],
    });

    const model = selectOnboardingModel(
      [small, parakeetV3],
      "small",
      "en-US",
      { osType: "macos" },
    );

    expect(model?.id).toBe("parakeet-tdt-0.6b-v3");
  });

  test("keeps the defensive fallback when Parakeet V3 is unavailable on macOS", () => {
    const small = createModel("small", {
      is_downloaded: true,
      supported_languages: ["en"],
    });

    const model = selectOnboardingModel([small], "small", "en-US", {
      osType: "macos",
    });

    expect(model?.id).toBe("small");
  });

  test("preserves existing English behavior on non-macOS", () => {
    const small = createModel("small", {
      supported_languages: ["en"],
    });
    const parakeetV2 = createModel("parakeet-tdt-0.6b-v2", {
      engine_type: "Parakeet",
      supported_languages: ["en"],
    });
    const parakeetV3 = createModel("parakeet-tdt-0.6b-v3", {
      engine_type: "Parakeet",
      supported_languages: ["en", "fr"],
    });

    const model = selectOnboardingModel(
      [small, parakeetV2, parakeetV3],
      "",
      "en-US",
      { osType: "windows" },
    );

    expect(model?.id).toBe("parakeet-tdt-0.6b-v2");
  });

  test("preserves existing locale-specific behavior on non-macOS", () => {
    const small = createModel("small", {
      supported_languages: ["zh", "en"],
    });
    const senseVoice = createModel("sense-voice-int8", {
      engine_type: "SenseVoice",
      supported_languages: ["zh", "yue", "ja", "ko"],
    });
    const parakeetV3 = createModel("parakeet-tdt-0.6b-v3", {
      engine_type: "Parakeet",
      supported_languages: ["en", "fr"],
    });

    const model = selectOnboardingModel(
      [small, senseVoice, parakeetV3],
      "",
      "ja-JP",
      { osType: "linux" },
    );

    expect(model?.id).toBe("sense-voice-int8");
  });
});
