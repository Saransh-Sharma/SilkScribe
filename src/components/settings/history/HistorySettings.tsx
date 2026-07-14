import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import {
  ChevronDown,
  FileJson,
  FileText,
  FolderOpen,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  commands,
  type HistoryFilter,
  type PaginatedHistory,
} from "@/bindings";
import type { HistoryEntry } from "@/bindings";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { Button } from "@/components/ui/Button";
import { AppPage } from "@/components/ui";
import { useHistoryFeed } from "@/hooks/useHistoryFeed";

const PAGE_SIZE = 50;

const selectHistoryEntries = (data: PaginatedHistory) => data.entries;

const entryVisibleText = (entry: HistoryEntry) =>
  entry.post_processed_text?.trim() || entry.transcription_text;

const toMarkdown = (entries: HistoryEntry[]) =>
  entries
    .map((entry) =>
      [
        `## ${entry.title}`,
        "",
        `- Timestamp: ${new Date(entry.timestamp * 1000).toISOString()}`,
        `- Saved: ${entry.saved ? "yes" : "no"}`,
        "",
        entryVisibleText(entry) || "_No transcript text._",
      ].join("\n"),
    )
    .join("\n\n---\n\n");

export const HistorySettings = () => {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const isFiltered =
    debouncedSearch.trim().length > 0 || historyFilter !== "all";

  const fetchHistoryEntries = useCallback(
    async (params?: {
      limit?: number;
      cursor?: number | null;
    }): Promise<PaginatedHistory> => {
      const cursor = typeof params?.cursor === "number" ? params.cursor : null;
      const limit = params?.limit ?? PAGE_SIZE;
      const query = debouncedSearch.trim();
      const result = isFiltered
        ? await commands.searchHistoryEntries(
            query.length > 0 ? query : null,
            historyFilter,
            cursor,
            limit,
          )
        : await commands.getHistoryEntries(cursor, limit);

      if (result.status !== "ok") {
        throw new Error(result.error);
      }

      return result.data;
    },
    [debouncedSearch, historyFilter, isFiltered],
  );

  const {
    entries,
    loading,
    error,
    reload,
    toggleSaved,
    copyToClipboard,
    getAudioUrl,
    deleteEntry,
    retryEntryTranscription,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useHistoryFeed<PaginatedHistory, number>({
    fetchData: fetchHistoryEntries,
    selectEntries: selectHistoryEntries,
    pagination: {
      pageSize: PAGE_SIZE,
      selectNextCursor: (data) =>
        data.has_more
          ? (data.entries[data.entries.length - 1]?.id ?? null)
          : null,
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    void reload(true);
  }, [debouncedSearch, historyFilter]);

  useEffect(() => {
    if (!exportMenuOpen) return;

    const dismiss = (event: MouseEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportMenuOpen(false);
    };

    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismissWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismissWithKeyboard);
    };
  }, [exportMenuOpen]);

  const openRecordingsFolder = async () => {
    try {
      await commands.openRecordingsFolder();
    } catch (openError) {
      console.error("Failed to open recordings folder:", openError);
    }
  };

  const fetchAllMatchingEntries = async () => {
    let cursor: number | null = null;
    const allEntries: HistoryEntry[] = [];
    let hasMoreEntries = true;

    while (hasMoreEntries) {
      const page = await fetchHistoryEntries({
        cursor,
        limit: 100,
      });
      allEntries.push(...page.entries);
      hasMoreEntries = page.has_more;
      cursor = page.entries[page.entries.length - 1]?.id ?? null;

      if (!cursor) {
        break;
      }
    }

    return allEntries;
  };

  const exportHistory = async (format: "markdown" | "json") => {
    try {
      const allEntries = await fetchAllMatchingEntries();
      if (allEntries.length === 0) {
        toast.warning(t("settings.history.exportEmpty"));
        return;
      }

      const path = await save({
        title: t("settings.history.exportTitle"),
        defaultPath:
          format === "markdown"
            ? "silkscribe-history.md"
            : "silkscribe-history.json",
        filters: [
          format === "markdown"
            ? { name: "Markdown", extensions: ["md"] }
            : { name: "JSON", extensions: ["json"] },
        ],
      });

      if (!path) return;

      const contents =
        format === "markdown"
          ? toMarkdown(allEntries)
          : JSON.stringify(allEntries, null, 2);
      await writeTextFile(path, contents);
      toast.success(t("settings.history.exportSuccess"));
    } catch (exportError) {
      console.error("Failed to export history:", exportError);
      toast.error(t("settings.history.exportError"));
    }
  };

  return (
    <AppPage
      eyebrow={t("settings.history.eyebrow")}
      title={t("settings.history.pageTitle")}
      description={t("settings.history.pageDescription")}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ss-text-tertiary"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("settings.history.searchPlaceholder")}
              className="min-h-10 w-56 rounded-[var(--ss-radius-pill)] border border-ss-border-subtle bg-ss-bg-surface-alt py-2 pe-3 ps-9 text-sm text-ss-text-primary outline-none transition-[border-color,background-color,box-shadow] placeholder:text-ss-text-tertiary focus:border-ss-brand-secondary/40 focus:bg-ss-bg-surface focus:ring-2 focus:ring-ss-action-focus/25"
            />
          </div>
          <div className="flex rounded-[var(--ss-radius-pill)] border border-ss-border-subtle bg-ss-bg-surface-alt p-1">
            {(["all", "saved", "failed"] as HistoryFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setHistoryFilter(filter)}
                className={`min-h-8 rounded-[var(--ss-radius-pill)] px-3 text-xs font-semibold transition-colors ${
                  historyFilter === filter
                    ? "bg-ss-bg-elevated text-ss-brand-secondary shadow-[var(--ss-shadow-card)]"
                    : "text-ss-text-tertiary hover:text-ss-text-primary"
                }`}
              >
                {t(`settings.history.filters.${filter}`)}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => {
              void openRecordingsFolder();
            }}
          >
            <FolderOpen className="h-4 w-4" />
            <span>{t("settings.history.openFolder")}</span>
          </Button>
          <div ref={exportMenuRef} className="relative">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((open) => !open)}
            >
              <FileText className="h-4 w-4" />
              <span>{t("settings.history.exportTitle")}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`}
              />
            </Button>
            {exportMenuOpen ? (
              <div
                role="menu"
                className="absolute end-0 top-[calc(100%+0.5rem)] z-[var(--ss-layer-dropdown)] w-52 rounded-[var(--ss-radius-md)] border border-ss-border-default bg-ss-bg-surface p-1 shadow-[var(--ss-shadow-lift)]"
              >
                {[
                  {
                    format: "markdown" as const,
                    label: t("settings.history.exportMarkdown"),
                    icon: FileText,
                  },
                  {
                    format: "json" as const,
                    label: t("settings.history.exportJson"),
                    icon: FileJson,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.format}
                      type="button"
                      role="menuitem"
                      className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-start text-sm text-ss-text-secondary transition-colors hover:bg-ss-bg-surface-alt hover:text-ss-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ss-action-focus/40"
                      onClick={() => {
                        setExportMenuOpen(false);
                        void exportHistory(item.format);
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      }
    >
      <HistoryFeed
        entries={entries}
        loading={loading}
        error={error}
        emptyTitle={
          isFiltered
            ? t("settings.history.emptyFiltered")
            : t("settings.history.empty")
        }
        emptyDescription={
          isFiltered
            ? t("settings.history.emptyFilteredDescription")
            : t("settings.history.emptyDescription")
        }
        errorTitle={t("settings.history.loadError")}
        errorDescription={t("settings.history.loadError")}
        retryLabel={t("settings.history.retry")}
        onRetry={() => {
          void reload(true);
        }}
        onToggleSaved={toggleSaved}
        onCopyText={(text) => {
          void copyToClipboard(text);
        }}
        onDelete={(id) => {
          void deleteEntry(id);
        }}
        onRetryTranscription={(id) => {
          void retryEntryTranscription(id);
        }}
        getAudioUrl={getAudioUrl}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        loadMoreLabel={t("settings.history.loadMore")}
        loadingMoreLabel={t("settings.history.loadingMore")}
        onLoadMore={() => {
          void loadMore();
        }}
      />
    </AppPage>
  );
};
