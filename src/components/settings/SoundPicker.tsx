import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Dropdown, DropdownOption } from "../ui/Dropdown";
import { PlayIcon } from "lucide-react";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSettings } from "../../hooks/useSettings";

interface SoundPickerProps {
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

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

  const selectedTheme = getSetting("sound_theme") ?? "marimba";

  const options: DropdownOption[] = [
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

  const handlePlayBothSounds = async () => {
    await playTestSound("start");
    await playTestSound("stop");
  };

  const previewLabel = t("settings.sound.soundTheme.preview");

  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="horizontal"
    >
      <div className="flex items-center gap-2">
        <Dropdown
          selectedValue={selectedTheme}
          onSelect={(value) =>
            updateSetting("sound_theme", value as "marimba" | "pop" | "custom")
          }
          options={options}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePlayBothSounds}
          title={previewLabel}
          aria-label={previewLabel}
        >
          <PlayIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </SettingContainer>
  );
};
