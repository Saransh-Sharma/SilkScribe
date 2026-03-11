import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type HomeDashboardPageData,
  type HomeHistoryCursor,
  type UsageSummary,
} from "@/bindings";
import { useHistoryFeed } from "@/hooks/useHistoryFeed";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { HomeHeader } from "./HomeHeader";
import { UsageStatsStrip } from "./UsageStatsStrip";

const EMPTY_SUMMARY: UsageSummary = {
  current_streak_days: 0,
  total_words: 0,
  average_wpm: 0,
  total_transcriptions: 0,
  longest_streak_days: 0,
};

const HOME_PAGE_SIZE = 50;
const MIDNIGHT_REFRESH_BUFFER_MS = 5_000;

const getLocalDayKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fetchHomeDashboardData = async (params?: {
  limit?: number;
  cursor?: HomeHistoryCursor | null;
}): Promise<HomeDashboardPageData> => {
  const result = await commands.getHomeDashboardData(
    params?.limit ?? null,
    params?.cursor ?? null,
  );
  if (result.status !== "ok") {
    throw new Error(result.error);
  }

  return result.data;
};

const selectHomeEntries = (data: HomeDashboardPageData) => data.entries;
const selectHomeCursor = (data: HomeDashboardPageData) => data.next_cursor;

const HOME_EMPTY_SUMMARY = () => ({ ...EMPTY_SUMMARY });

const HomeDashboard = () => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<UsageSummary>(HOME_EMPTY_SUMMARY);
  const lastFetchedDayRef = useRef<string>(getLocalDayKey());

  const {
    entries,
    loading,
    error,
    reload,
    loadMore,
    hasMore,
    isLoadingMore,
    toggleSaved,
    copyToClipboard,
    getAudioUrl,
    deleteEntry,
  } = useHistoryFeed<HomeDashboardPageData>({
    fetchData: fetchHomeDashboardData,
    selectEntries: selectHomeEntries,
    pagination: {
      pageSize: HOME_PAGE_SIZE,
      selectNextCursor: selectHomeCursor,
    },
    refreshEvents: ["history-updated", "usage-stats-updated"],
    onDataLoaded: (data) => {
      setSummary(data.summary);
      lastFetchedDayRef.current = getLocalDayKey();
    },
    onDataError: () => setSummary(HOME_EMPTY_SUMMARY()),
  });

  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    let midnightTimer: number | null = null;

    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, MIDNIGHT_REFRESH_BUFFER_MS);

      const delay = Math.max(1_000, nextMidnight.getTime() - now.getTime());
      midnightTimer = window.setTimeout(() => {
        void reloadRef.current(false);
        scheduleMidnightRefresh();
      }, delay);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const currentDay = getLocalDayKey();
      if (currentDay !== lastFetchedDayRef.current) {
        void reloadRef.current(false);
      }
    };

    scheduleMidnightRefresh();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (midnightTimer !== null) {
        window.clearTimeout(midnightTimer);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className="w-full space-y-5">
      <HomeHeader
        aside={<UsageStatsStrip summary={summary} loading={loading} />}
      />
      <section className="space-y-3">
        <div className="px-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
            {t("home.activityTitle")}
          </h2>
        </div>
        <HistoryFeed
          entries={entries}
          loading={loading}
          error={error}
          emptyTitle={t("home.empty.title")}
          emptyDescription={t("home.empty.description")}
          errorTitle={t("home.error.title")}
          errorDescription={t("home.error.description")}
          retryLabel={t("home.error.retry")}
          onRetry={() => {
            void reload(true);
          }}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreLabel={t("home.loadMore")}
          onLoadMore={() => {
            void loadMore();
          }}
          onToggleSaved={toggleSaved}
          onCopyText={(text) => {
            void copyToClipboard(text);
          }}
          onDelete={(id) => {
            void deleteEntry(id);
          }}
          getAudioUrl={getAudioUrl}
        />
      </section>
    </div>
  );
};

export default HomeDashboard;
