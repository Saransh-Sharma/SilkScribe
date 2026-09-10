import React from "react";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { Switch } from "@/components/ui/Switch";

/**
 * Workspace-shaped wrappers around the shared control primitives.
 *
 * The workspace lays its fields out as `<label>` + control rather than as
 * settings rows, so these adapt `Dropdown` and `Switch` to that shape. They
 * exist so the workspace stops reaching for raw `<select>` / `<input
 * type="checkbox">`, which render as unstyled OS widgets next to the rest of
 * the design system.
 */

interface WsSelectProps {
  label: React.ReactNode;
  /** Accessible name, when `label` is not a plain string. */
  ariaLabel?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const WsSelect: React.FC<WsSelectProps> = ({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
}) => (
  <div className="ws-field">
    <span className="ws-field-label">{label}</span>
    <Dropdown
      options={options}
      selectedValue={value}
      onSelect={onChange}
      disabled={disabled}
      ariaLabel={ariaLabel ?? (typeof label === "string" ? label : undefined)}
    />
  </div>
);

interface WsToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: React.ReactNode;
  disabled?: boolean;
}

export const WsToggle: React.FC<WsToggleProps> = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}) => (
  <div className="ws-field ws-field-toggle">
    <span className="ws-field-label">
      {label}
      {hint ? <small>{hint}</small> : null}
    </span>
    <Switch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      label={label}
    />
  </div>
);

interface WsMeterProps {
  /** 0..1 */
  value: number;
  label: string;
  /** `level` animates continuously (live audio); `progress` fills once. */
  variant?: "level" | "progress";
}

/**
 * Token-styled replacement for `<meter>` / `<progress>`, both of which render
 * as unstyled OS widgets that ignore the theme entirely.
 */
export const WsMeter: React.FC<WsMeterProps> = ({
  value,
  label,
  variant = "level",
}) => {
  const pct =
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      className="ws-meter"
      data-variant={variant}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <span className="ws-meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
};
