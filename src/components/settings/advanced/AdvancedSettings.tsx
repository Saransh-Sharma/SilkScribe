import React from "react";
import { useTranslation } from "react-i18next";
import { ShowOverlay } from "../ShowOverlay";
import { OverlayAppearance } from "../OverlayAppearance";
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
import { AccelerationSelector } from "../AccelerationSelector";
import { LazyStreamClose } from "../LazyStreamClose";
import { LogDirectory } from "../debug";
import { AppPage, DisclosureSection } from "../../ui";

export const AdvancedSettings: React.FC<{
  group?:
    | "app"
    | "output"
    | "transcription"
    | "history"
    | "support"
    | "experimental"
    | "runtime";
}> = ({ group }) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const experimentalEnabled = getSetting("experimental_enabled") || false;
  const pasteMethod = getSetting("paste_method") || "ctrl_v";
  const showsInsertionControls = pasteMethod !== "none";
  // No point offering to style an overlay the user has switched off.
  const overlayEnabled =
    (getSetting("overlay_position") || "bottom") !== "none";
  const usesClipboardMethod =
    pasteMethod === "ctrl_v" ||
    pasteMethod === "ctrl_shift_v" ||
    pasteMethod === "shift_insert";

  const content = (
    <div className="space-y-4">
      {(!group || group === "app") && (
        <DisclosureSection
          title={t("settings.advanced.groups.app")}
          description={t("settings.advanced.groupDescriptions.app")}
          defaultOpen
        >
          <StartHidden descriptionMode="inline" grouped={true} />
          <AutostartToggle descriptionMode="inline" grouped={true} />
          <ShowTrayIcon descriptionMode="inline" grouped={true} />
          <ShowOverlay descriptionMode="inline" grouped={true} />
          {overlayEnabled ? (
            <OverlayAppearance descriptionMode="inline" grouped={true} />
          ) : null}
        </DisclosureSection>
      )}

      {(!group || group === "output") && (
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
      )}

      {(!group || group === "transcription") && (
        <DisclosureSection
          title={t("settings.advanced.groups.transcription")}
          description={t("settings.advanced.groupDescriptions.transcription")}
        >
          <CustomWords descriptionMode="inline" grouped />
          <AppendTrailingSpace descriptionMode="inline" grouped={true} />
        </DisclosureSection>
      )}

      {(!group || group === "runtime") && (
        <DisclosureSection title={t("workspace.modelsLanguage")}>
          <ModelUnloadTimeoutSetting descriptionMode="inline" grouped />
          <AccelerationSelector descriptionMode="inline" grouped />
        </DisclosureSection>
      )}
      {(!group || group === "history") && (
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
      )}

      {(!group || group === "support") && (
        <DisclosureSection
          title={t("settings.advanced.groups.support")}
          description={t("settings.advanced.groupDescriptions.support")}
        >
          <UpdateChecksToggle descriptionMode="inline" grouped={true} />
          <AppDataDirectory descriptionMode="inline" grouped={true} />
          <LogDirectory descriptionMode="inline" grouped={true} />
        </DisclosureSection>
      )}

      {(!group || group === "experimental") && (
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
              <LazyStreamClose descriptionMode="inline" grouped={true} />
            </>
          ) : null}
        </DisclosureSection>
      )}
    </div>
  );
  return group ? (
    content
  ) : (
    <AppPage
      eyebrow={t("settings.advanced.eyebrow")}
      title={t("settings.advanced.pageTitle")}
      description={t("settings.advanced.pageDescription")}
    >
      {content}
    </AppPage>
  );
};
