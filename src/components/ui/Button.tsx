import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "primary-soft"
    | "secondary"
    | "danger"
    | "danger-ghost"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center gap-2 border font-semibold tracking-[0.01em] cursor-pointer select-none transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-ss-bg-canvas disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.985]";

  const variantClasses = {
    primary:
      "text-ss-brand-primary-ink bg-ss-action-primary border-ss-action-primary shadow-[var(--ss-shadow-card)] hover:bg-ss-action-primary-hover hover:border-ss-action-primary-hover hover:-translate-y-0.5 hover:shadow-[var(--ss-shadow-lift)] active:bg-ss-action-primary-pressed active:border-ss-action-primary-pressed",
    "primary-soft":
      "text-ss-brand-secondary bg-ss-brand-secondary/12 border-ss-brand-secondary/20 hover:bg-ss-brand-secondary/18 hover:border-ss-brand-secondary/30",
    secondary:
      "text-ss-text-primary bg-ss-bg-surface-alt border-ss-border-default hover:bg-ss-bg-elevated hover:border-ss-brand-secondary/40 hover:-translate-y-0.5",
    danger:
      "text-white bg-ss-action-danger border-ss-action-danger shadow-[var(--ss-shadow-card)] hover:bg-ss-action-danger-hover hover:border-ss-action-danger-hover hover:-translate-y-0.5 hover:shadow-[var(--ss-shadow-lift)]",
    "danger-ghost":
      "text-ss-state-danger border-transparent hover:text-ss-state-danger hover:bg-ss-state-danger/10",
    ghost:
      "text-current border-transparent hover:bg-ss-bg-surface-alt hover:border-ss-brand-secondary/25",
  };

  const sizeClasses = {
    sm: "min-h-9 px-3 text-xs rounded-[var(--ss-radius-sm)]",
    md: "min-h-10 px-4 text-sm rounded-[var(--ss-radius-md)]",
    lg: "min-h-11 px-5 text-base rounded-[var(--ss-radius-md)]",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
