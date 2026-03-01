import React from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";

type AlertVariant = "error" | "warning" | "info" | "success";

interface AlertProps {
  variant?: AlertVariant;
  /** When true, removes rounded corners for use inside containers */
  contained?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<
  AlertVariant,
  { container: string; icon: string; text: string }
> = {
  error: {
    container: "border-ss-state-danger/25 bg-ss-state-danger/10",
    icon: "text-ss-state-danger",
    text: "text-ss-text-secondary",
  },
  warning: {
    container: "border-ss-brand-highlight/25 bg-ss-brand-highlight/10",
    icon: "text-ss-brand-highlight",
    text: "text-ss-text-secondary",
  },
  info: {
    container: "border-ss-state-info/25 bg-ss-state-info/10",
    icon: "text-ss-state-info",
    text: "text-ss-text-secondary",
  },
  success: {
    container: "border-ss-state-success/25 bg-ss-state-success/10",
    icon: "text-ss-state-success",
    text: "text-ss-text-secondary",
  },
};

const variantIcons: Record<AlertVariant, React.ElementType> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
};

export const Alert: React.FC<AlertProps> = ({
  variant = "error",
  contained = false,
  children,
  className = "",
}) => {
  const styles = variantStyles[variant];
  const Icon = variantIcons[variant];

  return (
    <div
      className={`flex items-start gap-3 border p-4 ${styles.container} ${contained ? "rounded-[var(--ss-radius-md)]" : "rounded-[var(--ss-radius-lg)]"} ${className}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${styles.icon}`} />
      <p className={`text-sm leading-relaxed ${styles.text}`}>{children}</p>
    </div>
  );
};
