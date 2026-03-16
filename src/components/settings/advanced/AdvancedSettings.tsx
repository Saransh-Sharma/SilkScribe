import React from "react";
import { useTranslation } from "react-i18next";
import { ShowOverlay } from "../ShowOverlay";
import { ModelUnloadTimeoutSetting } from "../ModelUnloadTimeout";
import { CustomWords } from "../CustomWords";
import { StartHidden } from "../StartHidden";
import { AutostartToggle } from "../AutostartToggle";
import { ShowTrayIcon } from "../ShowTrayIcon";
import { PasteMethodSetting } from "../PasteMethod";
import { TypingToolSetting } from "../TypingTool";
import { ClipboardHandlingSetting } from "../ClipboardHandling";
import { AutoSubmit } from "../AutoSubmit";
import { PostProcessingToggle } from "../PostProcessingToggle";
import { AppendTrailingSpace } from "../AppendTrailingSpace";
import { HistoryLimit } from "../HistoryLimit";
import { RecordingRetentionPeriodSelector } from "../RecordingRetentionPeriod";
import { ExperimentalToggle } from "../ExperimentalToggle";
import { useSettings } from "../../../hooks/useSettings";
import { KeyboardImplementationSelector } from "../debug/KeyboardImplementationSelector";
import { AppDataDirectory } from "../AppDataDirectory";
import { UpdateChecksToggle } from "../UpdateChecksToggle";
import { LogDirectory } from "../debug";
import { AppPage, DisclosureSection } from "../../ui";

export const AdvancedSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const experimentalEnabled = getSetting("experimental_enabled") || false;
  const pasteMethod = getSetting("paste_method") || "ctrl_v";
  const showsInsertionControls = pasteMethod !== "none";
  const usesClipboardMethod =
    pasteMethod === "ctrl_v" ||
    pasteMethod === "ctrl_shift_v" ||
    pasteMethod === "shift_insert";

  return (
    <AppPage
      eyebrow={t("settings.advanced.eyebrow")}
      title={t("settings.advanced.pageTitle")}
      description={t("settings.advanced.pageDescription")}
    >
      <div className="space-y-4">
        <DisclosureSection
          title={t("settings.advanced.groups.app")}
          description={t("settings.advanced.groupDescriptions.app")}
          defaultOpen
        >
          <StartHidden descriptionMode="inline" grouped={true} />
          <AutostartToggle descriptionMode="inline" grouped={true} />
          <ShowTrayIcon descriptionMode="inline" grouped={true} />
          <ShowOverlay descriptionMode="inline" grouped={true} />
          <ModelUnloadTimeoutSetting descriptionMode="inline" grouped={true} />
        </DisclosureSection>

        <DisclosureSection
          title={t("settings.advanced.groups.output")}
          description={t("settings.advanced.groupDescriptions.output")}
          defaultOpen
        >
          <PasteMethodSetting descriptionMode="inline" grouped={true} />
          {usesClipboardMethod ? (
            <ClipboardHandlingSetting descriptionMode="inline" grouped={true} />
          ) : null}
          {showsInsertionControls ? (
            <AutoSubmit descriptionMode="inline" grouped={true} />
          ) : null}
          <TypingToolSetting descriptionMode="inline" grouped={true} />
        </DisclosureSection>

        <DisclosureSection
          title={t("settings.advanced.groups.transcription")}
          description={t("settings.advanced.groupDescriptions.transcription")}
        >
          <CustomWords descriptionMode="inline" grouped />
          <AppendTrailingSpace descriptionMode="inline" grouped={true} />
        </DisclosureSection>

        <DisclosureSection
          title={t("settings.advanced.groups.history")}
          description={t("settings.advanced.groupDescriptions.history")}
        >
          <HistoryLimit descriptionMode="inline" grouped={true} />
          <RecordingRetentionPeriodSelector
            descriptionMode="inline"
            grouped={true}
          />
        </DisclosureSection>

        <DisclosureSection
          title={t("settings.advanced.groups.support")}
          description={t("settings.advanced.groupDescriptions.support")}
        >
          <UpdateChecksToggle descriptionMode="inline" grouped={true} />
          <AppDataDirectory descriptionMode="inline" grouped={true} />
          <LogDirectory descriptionMode="inline" grouped={true} />
        </DisclosureSection>

        <DisclosureSection
          title={t("settings.advanced.groups.experimental")}
          description={t("settings.advanced.groupDescriptions.experimental")}
          tone="caution"
        >
          <ExperimentalToggle descriptionMode="inline" grouped={true} />
          {experimentalEnabled ? (
            <>
              <PostProcessingToggle descriptionMode="inline" grouped={true} />
              <KeyboardImplementationSelector
                descriptionMode="inline"
                grouped={true}
              />
            </>
          ) : null}
        </DisclosureSection>
      </div>
    </AppPage>
  );
};
