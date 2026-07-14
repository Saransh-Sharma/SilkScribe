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
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div
            key={stat.key}
            className="flex min-h-10 min-w-[128px] items-center gap-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-ss-bg-surface-alt text-ss-brand-primary">
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
                  <p className="text-sm font-semibold tabular-nums text-ss-text-primary">
                    {stat.value}
                  </p>
                  <p className="text-[11px] font-medium text-ss-text-tertiary">
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
