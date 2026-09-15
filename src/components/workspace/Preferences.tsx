import { AdvancedSettings } from "../settings/advanced/AdvancedSettings";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../ui/SettingsGroup";
import { ShortcutInput } from "../settings/ShortcutInput";
import { PushToTalk } from "../settings/PushToTalk";
import { MicrophoneSelector } from "../settings/MicrophoneSelector";
import { OutputDeviceSelector } from "../settings/OutputDeviceSelector";
import { AudioFeedback } from "../settings/AudioFeedback";
import { ThemeSelector } from "../settings/ThemeSelector";
import { AppLanguageSelector } from "../settings/AppLanguageSelector";
import { HistoryLimit } from "../settings/HistoryLimit";
import { RecordingRetentionPeriodSelector } from "../settings/RecordingRetentionPeriod";
import { useSettings } from "@/hooks/useSettings";
export function Preferences({
  page,
}: {
  page: "general" | "audio" | "appearance" | "history";
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return (
    <div className="space-y-5">
      {page === "general" && (
        <SettingsGroup title={t("workspace.dictation")}>
          <ShortcutInput shortcutId="transcribe" grouped />
          <PushToTalk descriptionMode="inline" grouped />
          {settings?.post_process_enabled && (
            <ShortcutInput shortcutId="transcribe_with_post_process" grouped />
          )}
        </SettingsGroup>
      )}
      {page === "audio" && (
        <SettingsGroup title={t("workspace.audio")}>
          <MicrophoneSelector descriptionMode="inline" grouped />
          <OutputDeviceSelector descriptionMode="inline" grouped />
          <AudioFeedback descriptionMode="inline" grouped />
        </SettingsGroup>
      )}
      {page === "appearance" && (
        <SettingsGroup title={t("workspace.appearance")}>
          <ThemeSelector descriptionMode="inline" grouped />
          <AppLanguageSelector descriptionMode="inline" grouped />
        </SettingsGroup>
      )}
      {page === "history" && (
        <>
          <p className="ws-alert">{t("workspace.retentionHelp")}</p>
          <SettingsGroup title={t("workspace.dictationRetention")}>
            <HistoryLimit descriptionMode="inline" grouped />
            <RecordingRetentionPeriodSelector
              descriptionMode="inline"
              grouped
            />
          </SettingsGroup>
        </>
      )}
      {page === "general" && (
        <>
          <AdvancedSettings group="output" />
          <AdvancedSettings group="transcription" />
          <AdvancedSettings group="experimental" />
        </>
      )}
      {page === "appearance" && <AdvancedSettings group="app" />}
      {page === "history" && <AdvancedSettings group="support" />}
    </div>
  );
}
