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
import { EmptyState } from "@/components/ui/EmptyState";
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

type HomeNavigationSection =
  | "home"
  | "general"
  | "models"
  | "advanced"
  | "postprocessing"
  | "history"
  | "debug";

interface HomeDashboardProps {
  onNavigate?: (section: HomeNavigationSection) => void;
  onStartPermissionRepair?: () => void | Promise<void>;
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

const HomeDashboard = ({
  onNavigate,
  onStartPermissionRepair,
}: HomeDashboardProps) => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { settings } = useSettings();
  const { currentModel, models } = useModelStore();
  const [summary, setSummary] = useState<UsageSummary>(HOME_EMPTY_SUMMARY);
  const [permissions, setPermissions] = useState<PermissionSnapshot>({
    accessibility: true,
    microphone: true,
  });
  const [isStartingPermissionRepair, setIsStartingPermissionRepair] =
    useState(false);
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
        console.warn(
          "Failed to load permissions for dashboard:",
          permissionError,
        );
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
  const startPermissionRepairOnce = async () => {
    if (isStartingPermissionRepair || !onStartPermissionRepair) {
      return;
    }

    setIsStartingPermissionRepair(true);
    try {
      await onStartPermissionRepair();
    } finally {
      setIsStartingPermissionRepair(false);
    }
  };

  const navigateWithPermissionGate = (destination: HomeNavigationSection) => {
    if (permissionsReady) {
      onNavigate?.(destination);
      return;
    }

    void startPermissionRepairOnce();
  };

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
      action: () => navigateWithPermissionGate("general"),
      actionLabel: t("home.readiness.permissions.action"),
      disabled: !permissionsReady && isStartingPermissionRepair,
    },
  ];

  const primaryDestination: HomeNavigationSection = !permissionsReady
    ? "general"
    : !currentModelInfo
      ? "models"
      : "general";

  return (
    <div className="w-full space-y-7">
      <section className="home-fade-in overflow-hidden rounded-[var(--ss-radius-xl)] border border-ss-border-default bg-ss-bg-surface shadow-[var(--ss-shadow-card)]">
        <div className="flex flex-col gap-5 px-5 pb-5 pt-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
          <div className="min-w-0 max-w-[64ch]">
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className={`relative flex h-3 w-3 items-center justify-center rounded-full ${
                  setupReady ? "bg-ss-state-success" : "bg-ss-brand-highlight"
                }`}
                aria-hidden="true"
              >
                <span className="absolute h-5 w-5 rounded-full border border-current opacity-20" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ss-text-tertiary">
                {t("home.welcome.eyebrow")}
              </p>
            </div>
            <h1 className="text-[2rem] font-semibold leading-[1.06] tracking-[-0.038em] text-ss-text-primary">
              {welcomeTitle}
            </h1>
            <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-ss-text-secondary">
              {welcomeDescription}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="shrink-0"
            disabled={!permissionsReady && isStartingPermissionRepair}
            onClick={() => navigateWithPermissionGate(primaryDestination)}
          >
            {setupActionLabel}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid border-y border-ss-border-subtle bg-ss-bg-surface-alt/38 sm:grid-cols-2 xl:grid-cols-4">
          {readinessItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={() => item.action()}
                className={`group min-w-0 px-4 py-3.5 text-start transition-colors duration-[var(--ss-duration-hover)] hover:bg-ss-bg-surface focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ss-action-focus/45 disabled:cursor-wait disabled:opacity-60 ${
                  index > 0 ? "border-s border-ss-border-subtle" : ""
                } ${index === 2 ? "sm:border-s-0 xl:border-s" : ""}`}
                aria-label={`${item.label}: ${item.value}. ${item.actionLabel}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] ${
                      item.status
                        ? "bg-ss-brand-primary/10 text-ss-brand-primary"
                        : "bg-ss-brand-secondary/10 text-ss-brand-secondary"
                    }`}
                  >
                    {item.status ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="truncate text-xs font-semibold text-ss-text-tertiary">
                    {item.label}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 ps-9">
                  <span className="truncate text-sm font-semibold text-ss-text-primary">
                    {item.value}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ss-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 lg:px-6">
          <UsageStatsStrip summary={summary} loading={loading} />
        </div>
      </section>

      {!hasActivity ? (
        <EmptyState
          title={t("home.firstUse.title")}
          description={t("home.firstUse.description")}
          action={
            <div className="flex flex-wrap gap-2">
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
          }
        />
      ) : null}

      <section className="space-y-3.5">
        <div className="flex items-end justify-between gap-4 px-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
            {t("home.activityTitle")}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate?.("history")}
          >
            {t("sidebar.history")}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
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
          loadingMoreLabel={t("home.loadingMore")}
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
