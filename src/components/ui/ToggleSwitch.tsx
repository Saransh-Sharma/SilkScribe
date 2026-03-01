import React from "react";
import { SettingContainer } from "./SettingContainer";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isUpdating = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  tooltipPosition = "top",
}) => {
  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      tooltipPosition={tooltipPosition}
    >
      <label
        className={`inline-flex min-h-11 items-center ${disabled || isUpdating ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <input
          type="checkbox"
          value=""
          className="sr-only peer"
          checked={checked}
          disabled={disabled || isUpdating}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="peer relative h-7 w-[52px] rounded-full border border-ss-border-default bg-ss-bg-elevated transition-colors duration-150 after:absolute after:start-[3px] after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-ss-bg-surface after:shadow-[0_3px_10px_rgba(0,0,0,0.18)] after:transition-transform after:duration-200 peer-checked:border-ss-action-primary peer-checked:bg-ss-action-primary peer-checked:after:translate-x-6 peer-checked:after:bg-ss-brand-primary-ink rtl:peer-checked:after:-translate-x-6 peer-focus-visible:ring-4 peer-focus-visible:ring-ss-action-focus/30 peer-disabled:opacity-50" />
      </label>
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-ss-brand-secondary border-t-transparent" />
        </div>
      )}
    </SettingContainer>
  );
};
