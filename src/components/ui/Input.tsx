import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "compact";
}

export const Input: React.FC<InputProps> = ({
  className = "",
  variant = "default",
  disabled,
  ...props
}) => {
  const baseClasses =
    "w-full border text-sm font-medium text-ss-text-primary bg-ss-bg-elevated border-ss-border-default rounded-[var(--ss-radius-md)] text-start transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-ss-text-tertiary";

  const interactiveClasses = disabled
    ? "opacity-60 cursor-not-allowed bg-ss-bg-surface-alt border-ss-border-subtle"
    : "hover:border-ss-brand-secondary/35 focus:outline-none focus:border-ss-brand-secondary focus:ring-2 focus:ring-ss-action-focus/30";

  const variantClasses = {
    default: "min-h-11 px-3.5 py-2.5",
    compact: "min-h-9 px-3 py-2",
  } as const;

  return (
    <input
      className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
};
