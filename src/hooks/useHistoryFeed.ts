import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  type HistoryEntry,
  type HomeHistoryCursor,
} from "@/bindings";
import { useOsType } from "./useOsType";

type FeedLoadMode = "replace" | "append";

const hasCursor = <TCursor>(
  cursor: TCursor | null | undefined,
): cursor is TCursor => cursor !== null && cursor !== undefined;

interface HistoryFetchParams<TCursor = HomeHistoryCursor> {
  limit?: number;
  cursor?: TCursor | null;
}

interface HistoryFeedPaginationOptions<TData, TCursor = HomeHistoryCursor> {
  pageSize?: number;
  selectNextCursor: (data: TData) => TCursor | null;
}

interface UseHistoryFeedOptions<TData, TCursor = HomeHistoryCursor> {
  fetchData: (params?: HistoryFetchParams<TCursor>) => Promise<TData>;
  selectEntries: (data: TData) => HistoryEntry[];
  onDataLoaded?: (data: TData, mode: FeedLoadMode) => void;
  onDataError?: () => void;
  refreshEvents?: string[];
  pagination?: HistoryFeedPaginationOptions<TData, TCursor>;
}

export const useHistoryFeed = <TData, TCursor = HomeHistoryCursor>({
  fetchData,
  selectEntries,
  onDataLoaded,
  onDataError,
  refreshEvents = ["history-updated"],
  pagination,
}: UseHistoryFeedOptions<TData, TCursor>) => {
  const osType = useOsType();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<TCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchDataRef = useRef(fetchData);
  const selectEntriesRef = useRef(selectEntries);
  const onDataLoadedRef = useRef(onDataLoaded);
  const onDataErrorRef = useRef(onDataError);
  const refreshEventsRef = useRef(refreshEvents);
  const paginationRef = useRef(pagination);
  const nextCursorRef = useRef<TCursor | null>(null);
  const isLoadingMoreRef = useRef(false);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const pendingDeleteTimersRef = useRef<Map<number, number>>(new Map());
  const pendingDeleteEntriesRef = useRef<Map<number, HistoryEntry>>(new Map());

  useEffect(() => {
    fetchDataRef.current = fetchData;
    selectEntriesRef.current = selectEntries;
    onDataLoadedRef.current = onDataLoaded;
    onDataErrorRef.current = onDataError;
    refreshEventsRef.current = refreshEvents;
    paginationRef.current = pagination;
  }, [
    fetchData,
    selectEntries,
    onDataLoaded,
    onDataError,
    refreshEvents,
    pagination,
  ]);

  const updateNextCursor = (cursor: TCursor | null) => {
    nextCursorRef.current = cursor;
    setNextCursor(cursor);
  };

  const updateLoadingMore = (loadingMore: boolean) => {
    isLoadingMoreRef.current = loadingMore;
    setIsLoadingMore(loadingMore);
  };

  const filterPendingDeletes = (nextEntries: HistoryEntry[]) =>
    nextEntries.filter(
      (entry) => !pendingDeleteEntriesRef.current.has(entry.id),
    );

  const sortEntries = (nextEntries: HistoryEntry[]) =>
    [...nextEntries].sort((left, right) => {
      if (right.timestamp !== left.timestamp) {
        return right.timestamp - left.timestamp;
      }
      return right.id - left.id;
    });

  const load = async (showLoadingState = false) => {
    if (showLoadingState) {
      setLoading(true);
    }

    try {
      const paginationOptions = paginationRef.current;
      const data = await fetchDataRef.current(
        paginationOptions
          ? {
              limit: paginationOptions.pageSize ?? 50,
              cursor: null,
            }
          : undefined,
      );
      const nextEntries = filterPendingDeletes(selectEntriesRef.current(data));
      setEntries(nextEntries);

      if (paginationOptions) {
        const cursor = paginationOptions.selectNextCursor(data);
        updateNextCursor(cursor);
        setHasMore(hasCursor(cursor));
      } else {
        updateNextCursor(null);
        setHasMore(false);
      }

      onDataLoadedRef.current?.(data, "replace");
      setError(null);
    } catch (loadError) {
      console.error("Failed to load history feed:", loadError);
      if (showLoadingState) {
        setEntries([]);
        updateNextCursor(null);
        setHasMore(false);
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
        onDataErrorRef.current?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    const paginationOptions = paginationRef.current;
    if (!paginationOptions) {
      return;
    }

    if (!hasCursor(nextCursorRef.current) || isLoadingMoreRef.current) {
      return;
    }

    const currentCursor = nextCursorRef.current;
    updateLoadingMore(true);

    try {
      const data = await fetchDataRef.current({
        limit: paginationOptions.pageSize ?? 50,
        cursor: currentCursor,
      });
      const nextEntries = filterPendingDeletes(selectEntriesRef.current(data));
      setEntries((currentEntries) => [...currentEntries, ...nextEntries]);

      const cursor = paginationOptions.selectNextCursor(data);
      updateNextCursor(cursor);
      setHasMore(hasCursor(cursor));
      onDataLoadedRef.current?.(data, "append");
      setError(null);
    } catch (loadError) {
      console.error("Failed to load more history feed entries:", loadError);
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
      onDataErrorRef.current?.();
    } finally {
      updateLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(true);

    const events =
      refreshEventsRef.current.length > 0
        ? refreshEventsRef.current
        : ["history-updated"];

    const unlistenPromises = events.map((eventName) =>
      listen(eventName, () => {
        void load();
      }),
    );

    return () => {
      void Promise.all(unlistenPromises).then((unlistenCallbacks) => {
        unlistenCallbacks.forEach((unlisten) => unlisten());
      });
    };
  }, []);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(
    () => () => {
      const pendingDeleteIds = Array.from(
        pendingDeleteEntriesRef.current.keys(),
      );
      pendingDeleteTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      pendingDeleteTimersRef.current.clear();
      pendingDeleteEntriesRef.current.clear();
      pendingDeleteIds.forEach((id) => {
        void commands
          .deleteHistoryEntry(id)
          .then((result) => {
            if (result.status !== "ok") {
              throw new Error(result.error);
            }
          })
          .catch((deleteError) => {
            console.error(
              "Failed to flush pending history delete:",
              deleteError,
            );
          });
      });
    },
    [],
  );

  const toggleSaved = async (id: number) => {
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") {
        throw new Error(result.error);
      }
    } catch (toggleError) {
      console.error("Failed to toggle saved status:", toggleError);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("settings.history.copySuccess"));
    } catch (clipboardError) {
      console.error("Failed to copy to clipboard:", clipboardError);
      toast.error(t("settings.history.copyError"));
    }
  };

  const getAudioUrl = async (fileName: string) => {
    try {
      const result = await commands.getAudioFilePath(fileName);
      if (result.status !== "ok") {
        throw new Error(result.error);
      }

      if (osType === "linux") {
        const fileData = await readFile(result.data);
        const blob = new Blob([fileData], { type: "audio/wav" });

        return URL.createObjectURL(blob);
      }

      return convertFileSrc(result.data, "asset");
    } catch (audioError) {
      console.error("Failed to resolve audio URL:", audioError);
      return null;
    }
  };

  const deleteEntry = async (id: number) => {
    const entry = entriesRef.current.find((candidate) => candidate.id === id);
    if (!entry || pendingDeleteEntriesRef.current.has(id)) {
      return;
    }

    pendingDeleteEntriesRef.current.set(id, entry);
    setEntries((currentEntries) =>
      currentEntries.filter((candidate) => candidate.id !== id),
    );

    const undoDelete = () => {
      const timerId = pendingDeleteTimersRef.current.get(id);
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
      pendingDeleteTimersRef.current.delete(id);
      const pendingEntry = pendingDeleteEntriesRef.current.get(id);
      pendingDeleteEntriesRef.current.delete(id);

      if (pendingEntry) {
        setEntries((currentEntries) =>
          currentEntries.some((candidate) => candidate.id === id)
            ? currentEntries
            : sortEntries([pendingEntry, ...currentEntries]),
        );
      }
    };

    const commitDelete = async () => {
      pendingDeleteTimersRef.current.delete(id);
      const pendingEntry = pendingDeleteEntriesRef.current.get(id);
      pendingDeleteEntriesRef.current.delete(id);

      if (!pendingEntry) {
        return;
      }

      try {
        const result = await commands.deleteHistoryEntry(id);
        if (result.status !== "ok") {
          throw new Error(result.error);
        }
      } catch (deleteError) {
        console.error("Failed to delete history entry:", deleteError);
        setEntries((currentEntries) =>
          currentEntries.some((candidate) => candidate.id === id)
            ? currentEntries
            : sortEntries([pendingEntry, ...currentEntries]),
        );
        toast.error(t("settings.history.deleteError"));
      }
    };

    const timerId = window.setTimeout(() => {
      void commitDelete();
    }, 5000);
    pendingDeleteTimersRef.current.set(id, timerId);

    toast(t("settings.history.deleteQueued"), {
      description: t("settings.history.deleteUndoDescription"),
      duration: 5000,
      action: {
        label: t("settings.history.undoDelete"),
        onClick: undoDelete,
      },
    });
  };

  const retryEntryTranscription = async (id: number) => {
    try {
      const result = await commands.retryHistoryEntryTranscription(id);
      if (result.status !== "ok") {
        throw new Error(result.error);
      }
    } catch (retryError) {
      console.error("Failed to retry history entry transcription:", retryError);
      toast.error(t("settings.history.retryTranscriptionError"));
    }
  };

  const reload = async (showLoadingState = true) => {
    await load(showLoadingState);
  };

  return {
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
    retryEntryTranscription,
  };
};
