import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { WordCorrectionThreshold } from "./WordCorrectionThreshold";
import { LogLevelSelector } from "./LogLevelSelector";
import { PasteDelay } from "./PasteDelay";
import { RecordingBuffer } from "./RecordingBuffer";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { AlwaysOnMicrophone } from "../AlwaysOnMicrophone";
import { ClamshellMicrophoneSelector } from "../ClamshellMicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { UpdateChecksToggle } from "../UpdateChecksToggle";
import { useSettings } from "../../../hooks/useSettings";
import { AppPage } from "../../ui";

export const DebugSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  const isLinux = type() === "linux";

  return (
    <AppPage>
      <SettingsGroup>
        <LogLevelSelector grouped={true} />
        <UpdateChecksToggle descriptionMode="inline" grouped={true} />
        <WordCorrectionThreshold descriptionMode="inline" grouped={true} />
        <PasteDelay descriptionMode="inline" grouped={true} />
        <RecordingBuffer descriptionMode="inline" grouped={true} />
        <AlwaysOnMicrophone descriptionMode="inline" grouped={true} />
        <ClamshellMicrophoneSelector descriptionMode="inline" grouped={true} />
        {/* Cancel shortcut is disabled on Linux due to instability with dynamic shortcut registration */}
        {!isLinux && (
          <ShortcutInput
            shortcutId="cancel"
            grouped={true}
            disabled={pushToTalk}
          />
        )}
      </SettingsGroup>
    </AppPage>
  );
};
