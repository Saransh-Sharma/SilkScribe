import React from "react";
import { FileText } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FileText,
  title,
  description,
  action,
  className = "",
}) => (
  <div
    className={`rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ss-bg-surface-alt)_70%,var(--ss-bg-surface))_0%,var(--ss-bg-surface)_100%)] px-5 py-8 shadow-[var(--ss-shadow-card)] ${className}`}
  >
    <div className="flex max-w-[60ch] items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ss-radius-md)] border border-ss-border-subtle bg-ss-bg-elevated text-ss-brand-secondary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ss-text-primary">{title}</p>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-ss-text-tertiary">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  </div>
);
