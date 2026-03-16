import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronRight,
  Keyboard,
  Mic,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import {
  commands,
  type HomeDashboardPageData,
  type HomeHistoryCursor,
  type UsageSummary,
} from "@/bindings";
import { useHistoryFeed } from "@/hooks/useHistoryFeed";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { useOsType } from "@/hooks/useOsType";
import { Button } from "@/components/ui/Button";
import { HistoryFeed } from "@/components/history/HistoryFeed";
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

interface HomeDashboardProps {
  onNavigate?: (
    section:
      | "home"
      | "general"
      | "models"
      | "advanced"
      | "postprocessing"
      | "history"
      | "debug",
  ) => void;
}

interface PermissionSnapshot {
  accessibility: boolean;
  microphone: boolean;
}

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

const HomeDashboard = ({ onNavigate }: HomeDashboardProps) => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { settings } = useSettings();
  const { currentModel, models } = useModelStore();
  const [summary, setSummary] = useState<UsageSummary>(HOME_EMPTY_SUMMARY);
  const [permissions, setPermissions] = useState<PermissionSnapshot>({
    accessibility: true,
    microphone: true,
  });
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

  useEffect(() => {
    if (osType !== "macos") {
      setPermissions({
        accessibility: true,
        microphone: true,
      });
      return;
    }

    let isCancelled = false;

    const loadPermissions = async () => {
      try {
        const [accessibility, microphone] = await Promise.all([
          checkAccessibilityPermission(),
          checkMicrophonePermission(),
        ]);

        if (!isCancelled) {
          setPermissions({ accessibility, microphone });
        }
      } catch (permissionError) {
        console.warn("Failed to load permissions for dashboard:", permissionError);
      }
    };

    void loadPermissions();

    return () => {
      isCancelled = true;
    };
  }, [osType]);

  const currentModelInfo = useMemo(
    () => models.find((model) => model.id === currentModel) ?? null,
    [currentModel, models],
  );
  const hasActivity = summary.total_transcriptions > 0 || entries.length > 0;
  const shortcutBinding =
    settings?.bindings?.transcribe?.current_binding?.trim() ?? "";
  const shortcutLabel = shortcutBinding
    ? formatKeyCombination(shortcutBinding, osType)
    : t("home.readiness.shortcut.missingValue");
  const microphoneLabel = settings?.selected_microphone || t("common.default");
  const modelLabel = currentModelInfo
    ? getTranslatedModelName(currentModelInfo, t)
    : t("home.readiness.model.missingValue");
  const permissionsReady =
    permissions.accessibility === true && permissions.microphone === true;
  const setupReady =
    Boolean(shortcutBinding) && Boolean(currentModelInfo) && permissionsReady;
  const welcomeTitle = hasActivity
    ? t("home.welcome.title")
    : t("home.welcome.firstRunTitle");
  const welcomeDescription = setupReady
    ? t("home.welcome.readyDescription")
    : t("home.welcome.setupDescription");
  const setupActionLabel = setupReady
    ? t("home.welcome.primaryReady")
    : t("home.welcome.primarySetup");

  const readinessItems = [
    {
      key: "shortcut",
      icon: Keyboard,
      label: t("home.readiness.shortcut.label"),
      value: shortcutLabel,
      status: Boolean(shortcutBinding),
      action: () => onNavigate?.("general"),
      actionLabel: t("home.readiness.shortcut.action"),
    },
    {
      key: "microphone",
      icon: Mic,
      label: t("home.readiness.microphone.label"),
      value: microphoneLabel,
      status: true,
      action: () => onNavigate?.("general"),
      actionLabel: t("home.readiness.microphone.action"),
    },
    {
      key: "model",
      icon: Sparkles,
      label: t("home.readiness.model.label"),
      value: modelLabel,
      status: Boolean(currentModelInfo),
      action: () => onNavigate?.("models"),
      actionLabel: t("home.readiness.model.action"),
    },
    {
      key: "permissions",
      icon: ShieldCheck,
      label: t("home.readiness.permissions.label"),
      value: permissionsReady
        ? t("home.readiness.permissions.ready")
        : t("home.readiness.permissions.needsAttention"),
      status: permissionsReady,
      action: () => onNavigate?.("general"),
      actionLabel: t("home.readiness.permissions.action"),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <section className="home-fade-in overflow-hidden rounded-[26px] border border-ss-border-subtle/80 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--ss-brand-highlight)_12%,var(--ss-bg-surface))_0%,var(--ss-bg-surface)_36%,color-mix(in_srgb,var(--ss-brand-secondary)_8%,var(--ss-bg-surface))_100%)] px-5 py-5 shadow-[var(--ss-shadow-card)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="min-w-0 space-y-5">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-brand-secondary">
                {t("home.welcome.eyebrow")}
              </p>
              <div>
                <h1 className="text-[2.15rem] font-semibold tracking-[-0.04em] text-ss-text-primary sm:text-[2.45rem]">
                  {welcomeTitle}
                </h1>
                <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ss-text-secondary sm:text-[15px]">
                  {welcomeDescription}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() =>
                  onNavigate?.(setupReady ? "general" : currentModelInfo ? "general" : "models")
                }
              >
                {setupActionLabel}
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => onNavigate?.("models")}
              >
                {t("home.welcome.secondaryAction")}
              </Button>
            </div>

            {!setupReady ? (
              <div className="rounded-[20px] border border-ss-brand-secondary/18 bg-ss-bg-surface/72 px-4 py-4">
                <p className="text-sm font-semibold text-ss-text-primary">
                  {t("home.setup.title")}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ss-text-secondary">
                  {t("home.setup.description")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!currentModelInfo ? (
                    <Button
                      type="button"
                      variant="primary-soft"
                      size="sm"
                      onClick={() => onNavigate?.("models")}
                    >
                      {t("home.setup.modelAction")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate?.("general")}
                  >
                    {t("home.setup.generalAction")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {readinessItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.key}
                  className="rounded-[20px] border border-ss-border-subtle bg-ss-bg-surface/88 px-4 py-4 shadow-[var(--ss-shadow-card)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${
                        item.status
                          ? "bg-ss-brand-primary/12 text-ss-brand-primary"
                          : "bg-ss-brand-secondary/10 text-ss-brand-secondary"
                      }`}
                    >
                      {item.status ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-ss-text-tertiary transition-colors duration-150 hover:text-ss-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/35"
                      onClick={item.action}
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-ss-text-tertiary">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-ss-text-primary">
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-ss-border-subtle/80 pt-4">
          <UsageStatsStrip summary={summary} loading={loading} />
        </div>
      </section>

      {!hasActivity ? (
        <section className="rounded-[22px] border border-ss-border-subtle bg-ss-bg-surface px-5 py-5 shadow-[var(--ss-shadow-card)]">
          <p className="text-sm font-semibold text-ss-text-primary">
            {t("home.firstUse.title")}
          </p>
          <p className="mt-2 max-w-[66ch] text-sm leading-relaxed text-ss-text-secondary">
            {t("home.firstUse.description")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onNavigate?.("general")}
            >
              {t("home.firstUse.generalAction")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onNavigate?.("models")}
            >
              {t("home.firstUse.modelsAction")}
            </Button>
          </div>
        </section>
      ) : null}

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
