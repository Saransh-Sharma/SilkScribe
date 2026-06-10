import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { commands, type PaginatedHistory } from "@/bindings";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { Button } from "@/components/ui/Button";
import { AppPage } from "@/components/ui";
import { useHistoryFeed } from "@/hooks/useHistoryFeed";

const PAGE_SIZE = 50;

const fetchHistoryEntries = async (params?: {
  limit?: number;
  cursor?: number | null;
}): Promise<PaginatedHistory> => {
  const result = await commands.getHistoryEntries(
    typeof params?.cursor === "number" ? params.cursor : null,
    params?.limit ?? PAGE_SIZE,
  );
  if (result.status !== "ok") {
    throw new Error(result.error);
  }

  return result.data;
};

const selectHistoryEntries = (data: PaginatedHistory) => data.entries;

export const HistorySettings = () => {
  const { t } = useTranslation();
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

  const openRecordingsFolder = async () => {
    try {
      await commands.openRecordingsFolder();
    } catch (openError) {
      console.error("Failed to open recordings folder:", openError);
    }
  };

  return (
    <AppPage
      eyebrow={t("settings.history.eyebrow")}
      title={t("settings.history.pageTitle")}
      description={t("settings.history.pageDescription")}
      actions={
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
      }
    >
      <HistoryFeed
        entries={entries}
        loading={loading}
        error={error}
        emptyTitle={t("settings.history.empty")}
        emptyDescription={t("settings.history.emptyDescription")}
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
