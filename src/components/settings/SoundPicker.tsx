import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Dropdown, DropdownOption } from "../ui/Dropdown";
import { PlayIcon } from "lucide-react";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettingsStore, type SoundCue } from "../../stores/settingsStore";
import { useSettings } from "../../hooks/useSettings";
import type { SoundTheme } from "@/bindings";

interface SoundPickerProps {
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** The two cues a user lives with on every dictation, previewed together. */
const THEME_PREVIEW: SoundCue[] = ["start", "transcribing"];

/** Every cue, individually auditionable. */
const ALL_CUES: SoundCue[] = [
  "start",
  "transcribing",
  "done",
  "error",
  "cancel",
];

export const SoundPicker: React.FC<SoundPickerProps> = ({
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const playTestSound = useSettingsStore((state) => state.playTestSound);
  const customSounds = useSettingsStore((state) => state.customSounds);

  const selectedTheme = getSetting("sound_theme") ?? "silk";

  const options: DropdownOption[] = [
    { value: "silk", label: t("settings.sound.soundTheme.options.silk") },
    { value: "marimba", label: t("settings.sound.soundTheme.options.marimba") },
    { value: "pop", label: t("settings.sound.soundTheme.options.pop") },
  ];

  // Only add Custom option if both custom sound files exist
  if (customSounds.start && customSounds.stop) {
    options.push({
      value: "custom",
      label: t("settings.sound.soundTheme.options.custom"),
    });
  }

  const handlePreviewTheme = async () => {
    for (const cue of THEME_PREVIEW) {
      await playTestSound(cue);
    }
  };

  const previewLabel = t("settings.sound.soundTheme.preview");

  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="stacked"
    >
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <Dropdown
            selectedValue={selectedTheme}
            onSelect={(value) =>
              updateSetting("sound_theme", value as SoundTheme)
            }
            options={options}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreviewTheme}
            title={previewLabel}
            aria-label={previewLabel}
          >
            <PlayIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Auditioning cues one at a time — chaining all five reads as noise. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {ALL_CUES.map((cue) => (
            <Button
              key={cue}
              variant="ghost"
              size="sm"
              className="min-h-8 px-2.5 text-[11px] font-semibold tracking-[0.06em] text-ss-text-tertiary"
              onClick={() => void playTestSound(cue)}
            >
              {t(`settings.sound.soundTheme.cues.${cue}`)}
            </Button>
          ))}
        </div>
      </div>
    </SettingContainer>
  );
};
