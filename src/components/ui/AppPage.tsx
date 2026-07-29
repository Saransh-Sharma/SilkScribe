import type { ReactNode } from "react";

interface AppPageProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export const AppPage = ({
  eyebrow,
  title,
  description,
  actions,
  children,
}: AppPageProps) => {
  return (
    <div className="ss-app-page w-full space-y-6">
      <header className="ss-page-header px-1 pb-1">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-brand-secondary">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.045em] text-ss-text-primary sm:text-[2.15rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-ss-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
};
