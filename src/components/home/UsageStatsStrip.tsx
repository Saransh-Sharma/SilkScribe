import { Flame, Gauge, PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type UsageSummary } from "@/bindings";

interface UsageStatsStripProps {
  summary: UsageSummary;
  loading: boolean;
}

export const UsageStatsStrip = ({ summary, loading }: UsageStatsStripProps) => {
  const { t } = useTranslation();
  const numberFormatter = new Intl.NumberFormat();

  const stats = [
    {
      key: "streak",
      label: t("home.stats.streak"),
      value: numberFormatter.format(summary.current_streak_days),
      icon: Flame,
    },
    {
      key: "words",
      label: t("home.stats.words"),
      value: numberFormatter.format(summary.total_words),
      icon: PenLine,
    },
    {
      key: "wpm",
      label: t("home.stats.wpm"),
      value: numberFormatter.format(summary.average_wpm),
      icon: Gauge,
    },
  ];

  return (
    <div className="flex flex-wrap gap-2.5">
      {stats.map((stat, index) => {
        const Icon = stat.icon;

        return (
          <div
            key={stat.key}
            className="home-fade-in flex min-h-11 min-w-[150px] flex-1 items-center gap-3 rounded-[18px] border border-ss-border-subtle/80 bg-ss-bg-surface/72 px-3.5 py-2.5 shadow-[var(--ss-shadow-card)] transition-transform duration-150 hover:-translate-y-px sm:flex-none"
            style={{ animationDelay: `${40 + index * 40}ms` }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-ss-bg-surface-alt text-ss-brand-primary">
              <Icon width={16} height={16} />
            </span>
            <div className="min-w-0">
              {loading ? (
                <>
                  <div className="h-4 w-14 rounded-full bg-ss-bg-surface-alt" />
                  <div className="mt-2 h-3 w-20 rounded-full bg-ss-bg-surface-alt" />
                </>
              ) : (
                <>
                  <p className="text-base font-semibold tabular-nums text-ss-text-primary">
                    {stat.value}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ss-text-tertiary">
                    {stat.label}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
