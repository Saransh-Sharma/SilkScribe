import React from "react";
import ResetIcon from "../icons/ResetIcon";

interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export const ResetButton: React.FC<ResetButtonProps> = React.memo(
  ({ onClick, disabled = false, className = "", ariaLabel, children }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`rounded-[var(--ss-radius-sm)] border border-transparent p-1.5 transition-[transform,background-color,border-color,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/40 ${
        disabled
          ? "cursor-not-allowed text-ss-text-disabled opacity-50"
          : "cursor-pointer text-ss-text-tertiary hover:border-ss-brand-secondary/25 hover:bg-ss-brand-secondary/10 hover:text-ss-brand-secondary active:translate-y-px"
      } ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children ?? <ResetIcon />}
    </button>
  ),
);
