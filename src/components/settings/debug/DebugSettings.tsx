import React from "react";
import { WordCorrectionThreshold } from "./WordCorrectionThreshold";
import { LogLevelSelector } from "./LogLevelSelector";
import { PasteDelay } from "./PasteDelay";
import { RecordingBuffer } from "./RecordingBuffer";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { AlwaysOnMicrophone } from "../AlwaysOnMicrophone";
import { AppPage } from "../../ui";

export const DebugSettings: React.FC = () => {
  return (
    <AppPage>
      <SettingsGroup>
        <LogLevelSelector grouped={true} />
        <WordCorrectionThreshold descriptionMode="inline" grouped={true} />
        <PasteDelay descriptionMode="inline" grouped={true} />
        <RecordingBuffer descriptionMode="inline" grouped={true} />
        <AlwaysOnMicrophone descriptionMode="inline" grouped={true} />
      </SettingsGroup>
    </AppPage>
  );
};
