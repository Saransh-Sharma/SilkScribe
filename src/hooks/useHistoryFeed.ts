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

interface HistoryFetchParams {
  limit?: number;
  cursor?: HomeHistoryCursor | null;
}

interface HistoryFeedPaginationOptions<TData> {
  pageSize?: number;
  selectNextCursor: (data: TData) => HomeHistoryCursor | null;
}

interface UseHistoryFeedOptions<TData> {
  fetchData: (params?: HistoryFetchParams) => Promise<TData>;
  selectEntries: (data: TData) => HistoryEntry[];
  onDataLoaded?: (data: TData, mode: FeedLoadMode) => void;
  onDataError?: () => void;
  refreshEvents?: string[];
  pagination?: HistoryFeedPaginationOptions<TData>;
}

export const useHistoryFeed = <TData>({
  fetchData,
  selectEntries,
  onDataLoaded,
  onDataError,
  refreshEvents = ["history-updated"],
  pagination,
}: UseHistoryFeedOptions<TData>) => {
  const osType = useOsType();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<HomeHistoryCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchDataRef = useRef(fetchData);
  const selectEntriesRef = useRef(selectEntries);
  const onDataLoadedRef = useRef(onDataLoaded);
  const onDataErrorRef = useRef(onDataError);
  const refreshEventsRef = useRef(refreshEvents);
  const paginationRef = useRef(pagination);
  const nextCursorRef = useRef<HomeHistoryCursor | null>(null);
  const isLoadingMoreRef = useRef(false);

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

  const updateNextCursor = (cursor: HomeHistoryCursor | null) => {
    nextCursorRef.current = cursor;
    setNextCursor(cursor);
  };

  const updateLoadingMore = (loadingMore: boolean) => {
    isLoadingMoreRef.current = loadingMore;
    setIsLoadingMore(loadingMore);
  };

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
      const nextEntries = selectEntriesRef.current(data);
      setEntries(nextEntries);

      if (paginationOptions) {
        const cursor = paginationOptions.selectNextCursor(data);
        updateNextCursor(cursor);
        setHasMore(Boolean(cursor));
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

    if (!nextCursorRef.current || isLoadingMoreRef.current) {
      return;
    }

    updateLoadingMore(true);

    try {
      const data = await fetchDataRef.current({
        limit: paginationOptions.pageSize ?? 50,
        cursor: nextCursorRef.current,
      });
      const nextEntries = selectEntriesRef.current(data);
      setEntries((currentEntries) => [...currentEntries, ...nextEntries]);

      const cursor = paginationOptions.selectNextCursor(data);
      updateNextCursor(cursor);
      setHasMore(Boolean(cursor));
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
    } catch (clipboardError) {
      console.error("Failed to copy to clipboard:", clipboardError);
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
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") {
        throw new Error(result.error);
      }
    } catch (deleteError) {
      console.error("Failed to delete history entry:", deleteError);
      toast.error(t("settings.history.deleteError"));
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
  };
};
