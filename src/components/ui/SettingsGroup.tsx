import React from "react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  actions,
  children,
}) => {
  return (
    <section className="space-y-2">
      {(title || description || actions) && (
        <div className="flex items-end justify-between gap-4 px-1">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-ss-text-tertiary">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className="overflow-visible rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface shadow-[var(--ss-shadow-card)]">
        <div className="divide-y divide-ss-border-subtle">{children}</div>
      </div>
    </section>
  );
};
