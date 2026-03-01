import React from "react";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "compact";
}

export const Textarea: React.FC<TextareaProps> = ({
  className = "",
  variant = "default",
  disabled,
  ...props
}) => {
  const baseClasses =
    "w-full border text-sm font-medium text-ss-text-primary bg-ss-bg-elevated border-ss-border-default rounded-[var(--ss-radius-md)] text-start transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-ss-text-tertiary focus:outline-none resize-y";

  const interactiveClasses = disabled
    ? "opacity-60 cursor-not-allowed bg-ss-bg-surface-alt border-ss-border-subtle"
    : "hover:border-ss-brand-secondary/35 focus:border-ss-brand-secondary focus:ring-2 focus:ring-ss-action-focus/30";

  const variantClasses = {
    default: "px-3.5 py-3 min-h-[120px]",
    compact: "px-3 py-2 min-h-[88px]",
  };

  return (
    <textarea
      className={`${baseClasses} ${interactiveClasses} ${variantClasses[variant]} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
};
