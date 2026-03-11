import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { commands, type HistoryEntry } from "@/bindings";
import { HistoryFeed } from "@/components/history/HistoryFeed";
import { Button } from "@/components/ui/Button";
import { useHistoryFeed } from "@/hooks/useHistoryFeed";

const fetchHistoryEntries = async (): Promise<HistoryEntry[]> => {
  const result = await commands.getHistoryEntries();
  if (result.status !== "ok") {
    throw new Error(result.error);
  }

  return result.data;
};

const selectHistoryEntries = (entries: HistoryEntry[]) => entries;

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
  } = useHistoryFeed<HistoryEntry[]>({
    fetchData: fetchHistoryEntries,
    selectEntries: selectHistoryEntries,
  });

  const openRecordingsFolder = async () => {
    try {
      await commands.openRecordingsFolder();
    } catch (openError) {
      console.error("Failed to open recordings folder:", openError);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ss-text-tertiary">
            {t("settings.history.title")}
          </h2>
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
      </div>
      <HistoryFeed
        entries={entries}
        loading={loading}
        error={error}
        emptyTitle={t("settings.history.empty")}
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
        getAudioUrl={getAudioUrl}
      />
    </div>
  );
};
