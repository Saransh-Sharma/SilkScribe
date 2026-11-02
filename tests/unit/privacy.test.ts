import { expect, test } from "bun:test";
import type { AppSettings } from "../../src/bindings";
import {
  cloudCleanupProvider,
  isOnDeviceProvider,
} from "../../src/lib/utils/privacy";

const settings = (
  id: string,
  baseUrl: string,
  enabled = true,
): Pick<
  AppSettings,
  "post_process_enabled" | "post_process_provider_id" | "post_process_providers"
> => ({
  post_process_enabled: enabled,
  post_process_provider_id: id,
  post_process_providers: [
    {
      id,
      label: id === "openai" ? "OpenAI" : "Custom",
      base_url: baseUrl,
      allow_base_url_edit: false,
      models_endpoint: null,
      supports_structured_output: false,
    },
  ],
});

test("Apple Intelligence and local servers run on this computer", () => {
  expect(isOnDeviceProvider("apple_intelligence", "")).toBe(true);
  expect(isOnDeviceProvider("custom", "http://localhost:11434/v1")).toBe(true);
  expect(isOnDeviceProvider("custom", "http://127.0.0.1:1234")).toBe(true);
  expect(isOnDeviceProvider("custom", "https://example.com/v1")).toBe(false);
  expect(isOnDeviceProvider("openai", "http://localhost")).toBe(false);
});

test("only a cloud provider in use makes text leave this computer", () => {
  expect(cloudCleanupProvider(null)).toBeNull();
  expect(
    cloudCleanupProvider(settings("openai", "https://api.openai.com/v1")),
  ).toBe("OpenAI");
  expect(
    cloudCleanupProvider(
      settings("openai", "https://api.openai.com/v1", false),
    ),
  ).toBeNull();
  expect(
    cloudCleanupProvider(settings("custom", "http://localhost:11434/v1")),
  ).toBeNull();
});
