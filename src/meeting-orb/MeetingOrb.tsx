import { listen } from "@tauri-apps/api/event";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type LiveSegment,
  type MeetingOrbPhase,
  type RecordingStatus,
} from "@/bindings";
import i18n from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";
import "./MeetingOrb.css";

/** Hover this long before the orb opens, so a pointer passing by doesn't. */
const EXPAND_DELAY_MS = 150;
/** Grace period after the pointer leaves, so brief exits don't close it. */
const COLLAPSE_DELAY_MS = 350;
/** Must match the `.orb-card` exit transition in MeetingOrb.css. */
const COLLAPSE_ANIMATION_MS = 160;
const DRAG_THRESHOLD_PX = 4;
/** How close to the bottom still counts as "following" the transcript. */
const FOLLOW_SLACK_PX = 24;

type Mode = "collapsed" | "expanded" | "collapsing";

interface LiveSegmentPayload {
  document_id: string;
  segment: LiveSegment;
}

interface LiveStatePayload {
  document_id: string;
  unavailable: boolean;
  behind: boolean;
}

interface OrbStatePayload {
  phase: MeetingOrbPhase;
  document_id: string | null;
  title: string;
}

export interface MeetingOrbPreview {
  mode: "collapsed" | "expanded";
  phase?: MeetingOrbPhase;
  title?: string;
  status?: Partial<RecordingStatus>;
  segments?: LiveSegment[];
  unavailable?: boolean;
  behind?: boolean;
  pinned?: boolean;
}

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

const resolveTheme = (): "light" | "dark" => {
  let preference = "system";
  try {
    preference = localStorage.getItem("ss-theme-preference") ?? "system";
  } catch {
    // Storage can be unavailable; fall through to the system appearance.
  }
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia?.(DARK_SCHEME_QUERY).matches ? "dark" : "light";
};

const formatElapsed = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const rest = String(value % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
};

const EMPTY_STATUS: RecordingStatus = {
  document_id: null,
  paused: false,
  seconds: 0,
  microphone_level: 0,
  system_level: 0,
  error: null,
  mic_gated: false,
};

const MeetingOrb: React.FC<{ preview?: MeetingOrbPreview }> = ({ preview }) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<MeetingOrbPhase>(
    preview?.phase ?? "recording",
  );
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState(preview?.title ?? "");
  const [status, setStatus] = useState<RecordingStatus>({
    ...EMPTY_STATUS,
    ...preview?.status,
  });
  const [segments, setSegments] = useState<LiveSegment[]>(
    preview?.segments ?? [],
  );
  const [unavailable, setUnavailable] = useState(preview?.unavailable ?? false);
  const [behind, setBehind] = useState(preview?.behind ?? false);
  const [mode, setMode] = useState<Mode>(preview?.mode ?? "collapsed");
  const [pinned, setPinned] = useState(preview?.pinned ?? false);
  const [following, setFollowing] = useState(true);
  const [consentCopied, setConsentCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const modeRef = useRef<Mode>(mode);
  const pinnedRef = useRef(pinned);
  const insideRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const dragRef = useRef<{ startY: number; moved: boolean } | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const documentIdRef = useRef<string | null>(null);
  modeRef.current = mode;
  pinnedRef.current = pinned;
  documentIdRef.current = documentId;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const expand = useCallback(async () => {
    clearTimer();
    if (modeRef.current === "expanded") return;
    // Grow the native panel first so the card never renders clipped.
    await commands.meetingOrbSetExpanded(true);
    setMode("expanded");
  }, []);

  const collapse = useCallback(() => {
    clearTimer();
    if (modeRef.current !== "expanded") return;
    setMode("collapsing");
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void commands.meetingOrbSetExpanded(false).then(() => {
        // The pointer may have come back during the exit animation.
        if (insideRef.current) {
          setMode("collapsed");
          void expand();
        } else {
          setMode("collapsed");
        }
      });
    }, COLLAPSE_ANIMATION_MS);
  }, [expand]);

  /** Re-evaluate open/closed after any pointer, pin, or drag change. */
  const reconcile = useCallback(() => {
    if (dragRef.current?.moved) return;
    clearTimer();
    const current = modeRef.current;
    if (insideRef.current && current === "collapsed") {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void expand();
      }, EXPAND_DELAY_MS);
    } else if (
      !insideRef.current &&
      current === "expanded" &&
      !pinnedRef.current
    ) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        collapse();
      }, COLLAPSE_DELAY_MS);
    }
  }, [collapse, expand]);

  // Theme: follow the app preference mirror and the OS appearance. Fixtures pin
  // the theme on the document themselves.
  useEffect(() => {
    if (preview) return;
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme();
    };
    apply();
    const query = window.matchMedia?.(DARK_SCHEME_QUERY);
    query?.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    return () => {
      query?.removeEventListener("change", apply);
      window.removeEventListener("storage", apply);
    };
  }, [preview]);

  // Backend state. Fetch a snapshot first so a reloaded webview catches up.
  useEffect(() => {
    if (preview) return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const acceptDocument = (id: string | null) => {
      if (id !== documentIdRef.current) {
        documentIdRef.current = id;
        setDocumentId(id);
        setSegments([]);
        setUnavailable(false);
        setBehind(false);
        setFollowing(true);
        setPinned(false);
        setActionError(null);
      }
    };

    const setup = async () => {
      const handlers = [
        listen<OrbStatePayload>("meeting-orb-state", ({ payload }) => {
          acceptDocument(payload.document_id);
          setPhase(payload.phase);
          setTitle(payload.title);
          if (payload.phase === "hidden") {
            clearTimer();
            setMode("collapsed");
          }
        }),
        listen<RecordingStatus>("meeting-status", ({ payload }) => {
          if (
            payload.document_id &&
            payload.document_id === documentIdRef.current
          ) {
            setStatus(payload);
          }
        }),
        listen<LiveSegmentPayload>("meeting-live-segment", ({ payload }) => {
          if (payload.document_id !== documentIdRef.current) return;
          setSegments((current) =>
            current.some((segment) => segment.id === payload.segment.id)
              ? current
              : [...current, payload.segment],
          );
        }),
        listen<LiveStatePayload>("meeting-live-state", ({ payload }) => {
          if (payload.document_id !== documentIdRef.current) return;
          setUnavailable(payload.unavailable);
          setBehind(payload.behind);
        }),
        listen<{ inside: boolean }>("meeting-orb-pointer", ({ payload }) => {
          insideRef.current = payload.inside;
          reconcile();
        }),
      ];
      for (const handler of handlers) {
        const off = await handler;
        if (disposed) off();
        else cleanups.push(off);
      }

      const [snapshot, transcript, recording] = await Promise.all([
        commands.meetingOrbSnapshot(),
        commands.workspaceLiveTranscript(),
        commands.workspaceRecordingStatus(),
      ]);
      if (disposed) return;
      acceptDocument(snapshot.document_id);
      setPhase(snapshot.phase);
      setTitle(snapshot.title);
      if (transcript && transcript.document_id === snapshot.document_id) {
        setSegments(transcript.segments);
        setUnavailable(transcript.unavailable);
        setBehind(transcript.behind);
      }
      if (recording.status === "ok") setStatus(recording.data);
    };

    void setup();
    return () => {
      disposed = true;
      clearTimer();
      cleanups.forEach((off) => off());
    };
  }, [preview, reconcile]);

  // Keep the newest line in view while the reader is following along.
  useEffect(() => {
    const list = listRef.current;
    if (list && following) list.scrollTop = list.scrollHeight;
  }, [segments, following, mode]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    setFollowing(
      list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_SLACK_PX,
    );
  };

  const jumpToLatest = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    setFollowing(true);
  };

  // The orb is both the drag handle and the pin toggle: a press that moves
  // more than a few points drags the panel along the screen edge, a press that
  // doesn't is a click.
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || preview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.screenY, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.screenY - drag.startY;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) clearTimer();
    drag.moved = true;
    void commands.meetingOrbDrag(delta, false);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      void commands.meetingOrbDrag(event.screenY - drag.startY, true);
      reconcile();
      return;
    }
    if (modeRef.current === "collapsed") {
      setPinned(true);
      void expand();
    } else {
      pinnedRef.current = !pinnedRef.current;
      setPinned(pinnedRef.current);
      reconcile();
    }
  };

  const runControl = async (operation: "pause" | "resume" | "stop") => {
    setActionError(null);
    const result = await commands.workspaceRecordingControl(operation);
    if (result.status === "error") setActionError(result.error);
    else setStatus(result.data);
  };

  const openDocument = () => {
    if (documentId) void commands.meetingOrbOpenDocument(documentId);
  };

  const state =
    phase === "finishing"
      ? "finishing"
      : status.error
        ? "error"
        : status.paused
          ? "paused"
          : "recording";
  const stateLabel = {
    recording: t("meetingOrb.recording"),
    paused: t("meetingOrb.paused"),
    finishing: t("meetingOrb.finishing"),
    error: t("meetingOrb.needsAttention"),
  }[state];
  const level = Math.max(status.microphone_level, status.system_level);
  const expanded = mode !== "collapsed";
  const direction = getLanguageDirection(i18n.language);

  return (
    <div
      className="orb-stage"
      data-mode={mode}
      data-state={state}
      data-gated={status.mic_gated || undefined}
      dir={direction}
      style={{ "--orb-level": level.toFixed(3) } as React.CSSProperties}
    >
      {expanded && (
        <section className="orb-card" aria-label={t("meetingOrb.cardLabel")}>
          <header className="orb-header">
            <div className="orb-heading">
              <p className="orb-title" title={title}>
                {title || t("meetingOrb.untitled")}
              </p>
              <p className="orb-meta">
                <span className="orb-state-label">{stateLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="orb-elapsed">
                  {formatElapsed(status.seconds)}
                </span>
              </p>
            </div>
          </header>

          <div className="orb-sources">
            <span className="orb-source">
              <span className="orb-source-label">
                {t("meetingOrb.microphone")}
              </span>
              <span className="orb-meter" aria-hidden="true">
                <span
                  style={{
                    transform: `scaleX(${status.mic_gated ? 0 : status.microphone_level})`,
                  }}
                />
              </span>
            </span>
            <span className="orb-source">
              <span className="orb-source-label">
                {t("meetingOrb.computerAudio")}
              </span>
              <span className="orb-meter" aria-hidden="true">
                <span style={{ transform: `scaleX(${status.system_level})` }} />
              </span>
            </span>
          </div>

          {status.mic_gated && (
            <p className="orb-notice" role="status">
              {t("meetingOrb.micGated")}
            </p>
          )}
          {(status.error || actionError) && (
            <p className="orb-notice orb-notice-error" role="alert">
              {actionError ?? status.error}
            </p>
          )}

          <div className="orb-transcript-wrap">
            {segments.length === 0 ? (
              <div className="orb-empty">
                <p className="orb-empty-title">
                  {unavailable
                    ? t("meetingOrb.unavailableTitle")
                    : t("meetingOrb.listening")}
                </p>
                <p className="orb-empty-body">
                  {unavailable
                    ? t("meetingOrb.unavailableBody")
                    : t("meetingOrb.listeningBody")}
                </p>
              </div>
            ) : (
              <ol
                className="orb-transcript"
                ref={listRef}
                onScroll={handleScroll}
                aria-label={t("meetingOrb.transcriptLabel")}
                aria-live="polite"
              >
                {segments.map((segment, index) => {
                  const speakerChanged =
                    index === 0 ||
                    segments[index - 1].source !== segment.source;
                  return (
                    <li
                      key={segment.id}
                      className="orb-line"
                      data-source={segment.source}
                      data-first={speakerChanged || undefined}
                    >
                      {speakerChanged && (
                        <span className="orb-speaker">
                          {segment.source === "mic"
                            ? t("meetingOrb.you")
                            : t("meetingOrb.others")}
                        </span>
                      )}
                      <span className="orb-text">{segment.text}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {!following && segments.length > 0 && (
              <button type="button" className="orb-chip" onClick={jumpToLatest}>
                {t("meetingOrb.jumpToLatest")}
              </button>
            )}
            {behind && (
              <p className="orb-behind" role="status">
                {t("meetingOrb.catchingUp")}
              </p>
            )}
          </div>

          <footer className="orb-footer">
            {phase === "finishing" ? (
              <p className="orb-finishing">{t("meetingOrb.finishing")}</p>
            ) : (
              <>
                <button
                  type="button"
                  className="orb-button"
                  onClick={() =>
                    void runControl(status.paused ? "resume" : "pause")
                  }
                >
                  {status.paused
                    ? t("meetingOrb.resume")
                    : t("meetingOrb.pause")}
                </button>
                <button
                  type="button"
                  className="orb-button orb-button-primary"
                  onClick={() => void runControl("stop")}
                >
                  {t("meetingOrb.stop")}
                </button>
                <button
                  type="button"
                  className="orb-button orb-button-quiet"
                  onClick={openDocument}
                  disabled={!documentId}
                >
                  {t("meetingOrb.open")}
                </button>
                <button
                  type="button"
                  className="orb-button orb-button-quiet"
                  onClick={() => {
                    void commands
                      .meetingOrbCopy(t("workspace.consent.message"))
                      .then((result) => {
                        if (result.status === "ok") setConsentCopied(true);
                      });
                  }}
                >
                  {t(
                    consentCopied
                      ? "workspace.consent.copied"
                      : "meetingOrb.letPeopleKnow",
                  )}
                </button>
              </>
            )}
          </footer>
        </section>
      )}

      <button
        type="button"
        className="orb"
        aria-label={t("meetingOrb.orbLabel", { state: stateLabel })}
        aria-pressed={expanded ? pinned : undefined}
        aria-expanded={expanded}
        title={expanded ? t("meetingOrb.pinHint") : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <span className="orb-ring" aria-hidden="true" />
        <span className="orb-core" aria-hidden="true" />
        {pinned && expanded && <span className="orb-pin" aria-hidden="true" />}
      </button>
    </div>
  );
};

export default MeetingOrb;
