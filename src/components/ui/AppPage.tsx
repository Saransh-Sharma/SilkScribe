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
    <div className="w-full space-y-6">
      <section className="space-y-3 px-1">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-brand-secondary">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.95rem] font-semibold tracking-[-0.03em] text-ss-text-primary sm:text-[2.15rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-ss-text-secondary sm:text-[15px]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </section>
      {children}
    </div>
  );
};
