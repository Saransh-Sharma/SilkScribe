import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "success" | "secondary";
  tone?: "default" | "accent" | "danger";
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "primary",
  tone,
  className = "",
}) => {
  const toneClasses = {
    default:
      "bg-ss-bg-surface-alt border-ss-border-default text-ss-text-secondary",
    accent:
      "bg-ss-brand-secondary/14 border-ss-brand-secondary/28 text-ss-brand-secondary",
    danger:
      "bg-ss-state-danger/12 border-ss-state-danger/25 text-ss-state-danger",
  } as const;

  const variantTone = {
    primary: "accent",
    success: "default",
    secondary: "default",
  } as const;

  const variantClasses = {
    primary: "",
    success: "text-ss-brand-highlight border-ss-brand-highlight/25 bg-ss-brand-highlight/12",
    secondary: "",
  };

  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${toneClasses[tone ?? variantTone[variant]]} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export default Badge;
