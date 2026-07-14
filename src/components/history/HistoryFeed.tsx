import { useTranslation } from "react-i18next";
import { type HistoryEntry } from "@/bindings";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/utils/dateFormat";
import { HistoryDayGroup } from "./HistoryDayGroup";

interface HistoryFeedProps {
  entries: HistoryEntry[];
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyDescription?: string;
  errorTitle: string;
  errorDescription: string;
  retryLabel: string;
  onRetry: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreLabel?: string;
  loadingMoreLabel?: string;
  onLoadMore?: () => void;
  onToggleSaved: (id: number) => void;
  onCopyText: (text: string) => void;
  onDelete: (id: number) => void;
  onRetryTranscription?: (id: number) => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
}

interface GroupedEntries {
  key: string;
  label: string;
  entries: HistoryEntry[];
}

const getLocalDayKey = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getRelativeDayOffset = (timestamp: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const entryDate = new Date(timestamp * 1000);
  entryDate.setHours(0, 0, 0, 0);

  return Math.round((today.getTime() - entryDate.getTime()) / 86_400_000);
};

export const HistoryFeed = ({
  entries,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  errorTitle,
  errorDescription,
  retryLabel,
  onRetry,
  hasMore = false,
  isLoadingMore = false,
  loadMoreLabel,
  loadingMoreLabel,
  onLoadMore,
  onToggleSaved,
  onCopyText,
  onDelete,
  onRetryTranscription,
  getAudioUrl,
}: HistoryFeedProps) => {
  const { t, i18n } = useTranslation();

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-3 w-28" />
        <div className="overflow-hidden rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface shadow-[var(--ss-shadow-card)]">
          <div className="divide-y divide-ss-border-subtle">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="grid gap-3 px-4 py-4 md:grid-cols-[92px_minmax(0,1fr)]"
              >
                <Skeleton className="h-3 w-14 md:ms-auto" />
                <div className="space-y-3">
                  <Skeleton className="h-3 w-full max-w-[64ch]" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <Skeleton
                      rounded="md"
                      className="h-11 w-full max-w-[320px]"
                    />
                    <div className="flex gap-2">
                      {Array.from({ length: 3 }).map((_, buttonIndex) => (
                        <Skeleton key={buttonIndex} className="h-11 w-11" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface px-5 py-5 shadow-[var(--ss-shadow-card)]">
        <Alert variant="error" contained>
          <span className="font-semibold text-ss-text-primary">
            {errorTitle}
          </span>
          <span className="mt-1 block">{errorDescription}</span>
        </Alert>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription ?? ""} />
    );
  }

  const groupedEntries: GroupedEntries[] = [];
  const entryGroups = new Map<string, GroupedEntries>();

  for (const entry of entries) {
    const groupKey = getLocalDayKey(entry.timestamp);
    let group = entryGroups.get(groupKey);

    if (!group) {
      const relativeDayOffset = getRelativeDayOffset(entry.timestamp);
      const label =
        relativeDayOffset === 0
          ? t("home.days.today")
          : relativeDayOffset === 1
            ? t("home.days.yesterday")
            : formatDate(String(entry.timestamp), i18n.language);

      group = {
        key: groupKey,
        label,
        entries: [],
      };

      entryGroups.set(groupKey, group);
      groupedEntries.push(group);
    }

    group.entries.push(entry);
  }

  return (
    <div className="space-y-5">
      {groupedEntries.map((group) => (
        <HistoryDayGroup
          key={group.key}
          label={group.label}
          entries={group.entries}
          onToggleSaved={onToggleSaved}
          onCopyText={onCopyText}
          onDelete={onDelete}
          onRetryTranscription={onRetryTranscription}
          getAudioUrl={getAudioUrl}
        />
      ))}
      {hasMore && onLoadMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore
              ? (loadingMoreLabel ?? loadMoreLabel ?? retryLabel)
              : (loadMoreLabel ?? retryLabel)}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
