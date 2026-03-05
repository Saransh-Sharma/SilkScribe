import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface HomeHeaderProps {
  aside?: ReactNode;
}

export const HomeHeader = ({ aside }: HomeHeaderProps) => {
  const { t } = useTranslation();

  return (
    <section className="home-fade-in rounded-[var(--ss-radius-xl)] border border-ss-border-subtle/80 bg-gradient-to-br from-ss-bg-surface via-ss-bg-surface to-ss-bg-surface-alt/35 px-5 py-5 shadow-[var(--ss-shadow-card)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-ss-text-primary sm:text-[2.25rem]">
            {t("home.title")}
          </h1>
          <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-ss-text-tertiary sm:text-[15px]">
            {t("home.subtitle")}
          </p>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </section>
  );
};
