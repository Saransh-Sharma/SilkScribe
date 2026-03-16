import React from "react";
import { useTranslation } from "react-i18next";
import { AppPage } from "../../ui/AppPage";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled } = useSettings();
  return (
    <AppPage
      eyebrow={t("settings.general.eyebrow")}
      title={t("settings.general.pageTitle")}
      description={t("settings.general.pageDescription")}
    >
      <SettingsGroup
        title={t("settings.general.sections.recording")}
        description={t("settings.general.sections.recordingDescription")}
      >
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk descriptionMode="inline" grouped={true} />
        <MicrophoneSelector descriptionMode="inline" grouped={true} />
        <MuteWhileRecording descriptionMode="inline" grouped={true} />
      </SettingsGroup>
      <SettingsGroup
        title={t("settings.general.sections.feedback")}
        description={t("settings.general.sections.feedbackDescription")}
      >
        <AudioFeedback descriptionMode="inline" grouped={true} />
        {audioFeedbackEnabled ? (
          <>
            <OutputDeviceSelector descriptionMode="inline" grouped={true} />
            <VolumeSlider />
          </>
        ) : null}
      </SettingsGroup>
      <SettingsGroup
        title={t("settings.general.sections.app")}
        description={t("settings.general.sections.appDescription")}
      >
        <AppLanguageSelector descriptionMode="inline" grouped={true} />
      </SettingsGroup>
    </AppPage>
  );
};
