import React from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import {
  DisclosureSection,
  Dropdown,
  SettingContainer,
  SettingsGroup,
  ToggleSwitch,
} from "../ui";
import { PostProcessingToggle } from "./PostProcessingToggle";
import { ShortcutInput } from "./ShortcutInput";
import {
  PostProcessingSettingsApi,
  PostProcessingSettingsPrompts,
} from "./post-processing/PostProcessingSettings";
import { isOnDeviceProvider } from "@/lib/utils/privacy";

/** Built-in cleanup prompts, lightest first, and their translation keys. */
const LEVELS = [
  ["builtin_light", "light"],
  ["default_improve_transcriptions", "standard"],
  ["builtin_rewrite", "rewrite"],
] as const;

/** AI cleanup, as one section of the Dictation settings. */
export const AiCleanupSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const enabled = getSetting("post_process_enabled") ?? false;
  const hasCommandShortcut = Boolean(getSetting("bindings")?.command);

  const prompts = getSetting("post_process_prompts") ?? [];
  const selectedPrompt = getSetting("post_process_selected_prompt_id") ?? "";
  const builtIn = new Map<string, string>(LEVELS);
  const levelOptions = [
    ...LEVELS.filter(([id]) => prompts.some((p) => p.id === id)).map(
      ([id, key]) => ({
        value: id,
        label: t(`settings.aiCleanup.levels.${key}`),
      }),
    ),
    ...prompts
      .filter((prompt) => !builtIn.has(prompt.id))
      .map((prompt) => ({ value: prompt.id, label: prompt.name })),
  ];
  const levelKey = builtIn.get(selectedPrompt) ?? "custom";

  const providerId = getSetting("post_process_provider_id") ?? "";
  const provider = (getSetting("post_process_providers") ?? []).find(
    (candidate) => candidate.id === providerId,
  );
  const onDevice = isOnDeviceProvider(providerId, provider?.base_url);

  return (
    <SettingsGroup title={t("settings.aiCleanup.title")}>
      <PostProcessingToggle descriptionMode="inline" grouped />
      {enabled && (
        <>
          <ToggleSwitch
            checked={getSetting("ai_cleanup_on_main") ?? false}
            onChange={(value) => updateSetting("ai_cleanup_on_main", value)}
            isUpdating={isUpdating("ai_cleanup_on_main")}
            label={t("settings.aiCleanup.everyDictation.label")}
            description={t("settings.aiCleanup.everyDictation.description")}
            descriptionMode="inline"
            grouped
          />
          <SettingContainer
            title={t("settings.aiCleanup.level.title")}
            description={t(`settings.aiCleanup.levelHelp.${levelKey}`)}
            descriptionMode="inline"
            layout="horizontal"
            grouped
          >
            <Dropdown
              ariaLabel={t("settings.aiCleanup.level.title")}
              options={levelOptions}
              selectedValue={selectedPrompt || null}
              onSelect={(value) =>
                updateSetting("post_process_selected_prompt_id", value)
              }
              disabled={isUpdating("post_process_selected_prompt_id")}
            />
          </SettingContainer>
          <PostProcessingSettingsApi />
          <p className="px-4 py-3 text-xs text-ss-text-tertiary">
            {onDevice
              ? t("settings.aiCleanup.onDevice")
              : t("settings.aiCleanup.cloud", {
                  provider: provider?.label ?? providerId,
                })}
          </p>
          <ToggleSwitch
            checked={getSetting("nearby_text_context") ?? true}
            onChange={(value) => updateSetting("nearby_text_context", value)}
            isUpdating={isUpdating("nearby_text_context")}
            label={t("settings.aiCleanup.nearbyText.label")}
            description={t(
              onDevice
                ? "settings.aiCleanup.nearbyText.description"
                : "settings.aiCleanup.nearbyText.descriptionCloud",
            )}
            descriptionMode="inline"
            grouped
          />
          {!onDevice && (getSetting("nearby_text_context") ?? true) && (
            <ToggleSwitch
              checked={getSetting("share_context_with_cloud") ?? false}
              onChange={(value) =>
                updateSetting("share_context_with_cloud", value)
              }
              isUpdating={isUpdating("share_context_with_cloud")}
              label={t("settings.aiCleanup.shareNearbyText.label", {
                provider: provider?.label ?? providerId,
              })}
              description={t("settings.aiCleanup.shareNearbyText.description")}
              descriptionMode="inline"
              grouped
            />
          )}
          <ShortcutInput
            shortcutId="transcribe_with_post_process"
            descriptionMode="inline"
            grouped
          />
          {/* Command mode exists where the selection can be read (macOS). */}
          {hasCommandShortcut && (
            <ShortcutInput
              shortcutId="command"
              descriptionMode="inline"
              grouped
            />
          )}
          <DisclosureSection title={t("settings.aiCleanup.prompts")}>
            <PostProcessingSettingsPrompts />
          </DisclosureSection>
        </>
      )}
    </SettingsGroup>
  );
};
