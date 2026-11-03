import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { commands, type LiveSegment } from "@/bindings";
import { duration } from "./api";

// Stable default so the sync effect below doesn't re-run on every render.
const NO_SEGMENTS: LiveSegment[] = [];

/**
 * The quick "You / Others" transcript made while a meeting records. It streams
 * while the meeting is live and stays readable until the full pass replaces it.
 */
export function LiveTranscript({
  documentId,
  stored = NO_SEGMENTS,
  live,
}: {
  documentId: string;
  stored?: LiveSegment[];
  live: boolean;
}) {
  const { t } = useTranslation();
  const [segments, setSegments] = useState<LiveSegment[]>(stored);

  useEffect(() => {
    setSegments(stored);
  }, [stored]);

  useEffect(() => {
    if (!live) return;
    let disposed = false;
    let off: (() => void) | null = null;
    const merge = (incoming: LiveSegment[]) =>
      setSegments((current) => {
        const known = new Set(current.map((segment) => segment.id));
        const added = incoming.filter((segment) => !known.has(segment.id));
        return added.length ? [...current, ...added] : current;
      });
    void listen<{ document_id: string; segment: LiveSegment }>(
      "meeting-live-segment",
      ({ payload }) => {
        if (payload.document_id === documentId) merge([payload.segment]);
      },
    ).then((unlisten) => {
      if (disposed) unlisten();
      else off = unlisten;
    });
    void commands.workspaceLiveTranscript().then((transcript) => {
      if (!disposed && transcript?.document_id === documentId) {
        merge(transcript.segments);
      }
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, [documentId, live]);

  if (!segments.length) {
    return (
      <p className="ws-empty-copy">
        {live
          ? t("meetingOrb.listeningBody")
          : t("workspace.transcriptPending")}
      </p>
    );
  }

  return (
    <section
      className="ws-live-transcript"
      aria-label={t("workspace.liveTranscript")}
    >
      <p className="ws-live-note">
        <strong>{t("workspace.liveTranscript")}</strong>{" "}
        {t("workspace.liveTranscriptNote")}
      </p>
      {/* Not a live region: announcing every caption as it arrives drowns
          out everything else. The list is there to read. */}
      <ol>
        {segments.map((segment, index) => (
          <li key={segment.id} data-source={segment.source}>
            {(index === 0 || segments[index - 1].source !== segment.source) && (
              <span className="ws-live-speaker">
                {segment.source === "mic"
                  ? t("meetingOrb.you")
                  : t("meetingOrb.others")}
                <time>{duration(segment.start)}</time>
              </span>
            )}
            <span>{segment.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
