import React from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name. Omit only when an ancestor <label> already names it. */
  label?: string;
  className?: string;
}

/**
 * The bare toggle control, without any row chrome.
 *
 * `ToggleSwitch` pairs this with a `SettingContainer` for the settings pages;
 * surfaces with their own layout (the workspace) use this directly rather than
 * falling back to a raw `<input type="checkbox">`.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  className = "",
}) => (
  <span
    className={`inline-flex shrink-0 items-center ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${className}`}
  >
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      value=""
      className="sr-only peer"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="ss-toggle-track peer relative block h-7 w-[52px] rounded-full border border-ss-border-default bg-ss-bg-elevated transition-[background-color,border-color,transform] duration-200 after:absolute after:start-[3px] after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-ss-bg-surface after:shadow-[var(--ss-shadow-control-thumb)] after:transition-transform after:duration-200 peer-checked:border-ss-action-primary peer-checked:bg-ss-action-primary peer-checked:after:translate-x-6 peer-checked:after:bg-ss-brand-primary-ink rtl:peer-checked:after:-translate-x-6 peer-focus-visible:ring-4 peer-focus-visible:ring-ss-action-focus/20 peer-disabled:opacity-50" />
  </span>
);
