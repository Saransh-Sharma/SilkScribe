import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { type } from "@tauri-apps/plugin-os";
import { AdvancedSettings } from "../settings/advanced/AdvancedSettings";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../ui/SettingsGroup";
import { ShortcutInput } from "../settings/ShortcutInput";
import { PushToTalk } from "../settings/PushToTalk";
import { MicrophoneSelector } from "../settings/MicrophoneSelector";
import { ClamshellMicrophoneSelector } from "../settings/ClamshellMicrophoneSelector";
import { OutputDeviceSelector } from "../settings/OutputDeviceSelector";
import { AudioFeedback } from "../settings/AudioFeedback";
import { MuteWhileRecording } from "../settings/MuteWhileRecording";
import { AiCleanupSettings } from "../settings/AiCleanupSettings";
import { DictationStyles } from "../settings/DictationStyles";
import { DictionarySettings } from "../settings/DictionarySettings";
import { ThemeSelector } from "../settings/ThemeSelector";
import { AppLanguageSelector } from "../settings/AppLanguageSelector";
import { HistoryLimit } from "../settings/HistoryLimit";
import { RecordingRetentionPeriodSelector } from "../settings/RecordingRetentionPeriod";
import { UpdateChecksToggle } from "../settings/UpdateChecksToggle";
import { ModelsSettings } from "../settings/models/ModelsSettings";
import { useSettings } from "@/hooks/useSettings";
import { cloudCleanupProvider } from "@/lib/utils/privacy";

/** The Settings sections Preferences lays out. Engines and Meetings & notes
 * are laid out by the workspace, which owns the engine downloads. */
export type PreferencesPage =
  | "general"
  | "dictation"
  | "ai"
  | "dictionary"
  | "audio"
  | "history";

export function Preferences({ page }: { page: PreferencesPage }) {
  const { t } = useTranslation();
  const { settings, getSetting } = useSettings();
  const isLinux = (() => {
    try {
      return type() === "linux";
    } catch {
      return false;
    }
  })();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (page !== "general") return;
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, [page]);
  const cloudProvider = cloudCleanupProvider(settings);

  return (
    <div className="space-y-5">
      {page === "general" && (
        <>
          <SettingsGroup title={t("workspace.appearance")}>
            <ThemeSelector descriptionMode="inline" grouped />
            <AppLanguageSelector descriptionMode="inline" grouped />
          </SettingsGroup>
          <AdvancedSettings group="app" />
          <SettingsGroup title={t("workspace.about")}>
            <UpdateChecksToggle descriptionMode="inline" grouped />
            {version && (
              <p className="px-4 py-3 text-sm text-ss-text-secondary">
                {t("workspace.version", { version })}
              </p>
            )}
          </SettingsGroup>
        </>
      )}
      {page === "dictation" && (
        <>
          <SettingsGroup title={t("workspace.dictation")}>
            <ShortcutInput shortcutId="transcribe" grouped />
            <PushToTalk descriptionMode="inline" grouped />
            {/* Unstable with dynamic shortcut registration on Linux. */}
            {!isLinux && settings?.bindings.cancel && (
              <ShortcutInput
                shortcutId="cancel"
                grouped
                disabled={getSetting("push_to_talk") ?? false}
              />
            )}
          </SettingsGroup>
          <ModelsSettings />
          <AdvancedSettings group="output" />
          <AdvancedSettings group="transcription" />
          <AdvancedSettings group="experimental" />
        </>
      )}
      {page === "ai" && (
        <>
          <AiCleanupSettings />
          <DictationStyles />
        </>
      )}
      {page === "dictionary" && <DictionarySettings />}
      {page === "audio" && (
        <SettingsGroup title={t("workspace.audio")}>
          <MicrophoneSelector descriptionMode="inline" grouped />
          <ClamshellMicrophoneSelector descriptionMode="inline" grouped />
          <OutputDeviceSelector descriptionMode="inline" grouped />
          <AudioFeedback descriptionMode="inline" grouped />
          <MuteWhileRecording descriptionMode="inline" grouped />
        </SettingsGroup>
      )}
      {page === "history" && (
        <>
          <SettingsGroup title={t("workspace.privacy.title")}>
            <p className="px-4 py-3 text-sm text-ss-text-secondary">
              {t("workspace.privacy.local")}
            </p>
            <p className="px-4 py-3 text-sm text-ss-text-secondary">
              {cloudProvider
                ? t("workspace.privacy.cloud", { provider: cloudProvider })
                : t("workspace.privacy.noCloud")}
            </p>
          </SettingsGroup>
          <p className="ws-alert">{t("workspace.retentionHelp")}</p>
          <SettingsGroup title={t("workspace.dictationRetention")}>
            <HistoryLimit descriptionMode="inline" grouped />
            <RecordingRetentionPeriodSelector
              descriptionMode="inline"
              grouped
            />
          </SettingsGroup>
          <AdvancedSettings group="support" />
        </>
      )}
    </div>
  );
}
