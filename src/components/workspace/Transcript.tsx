import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  Download,
  Search,
  Bookmark,
  RotateCcw,
  Trash2,
  Users,
  FileText,
} from "lucide-react";
import type { NoteEvidence, NotesSection } from "@/bindings";
import { toast } from "sonner";
import { api, busy, duration, type Document, type Notes } from "./api";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Dropdown } from "../ui/Dropdown";
import { SaveQueue } from "./saveQueue";
import { drafts } from "./drafts";
import { AudioPlayer } from "../ui/AudioPlayer";

export function Transcript({
  document: initial,
  onBack,
  onUpdated,
  onSetupModels,
  saveBarrier,
}: {
  document: Document;
  onBack: () => void;
  onUpdated: () => void;
  onSetupModels: () => void;
  saveBarrier: React.MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const { t } = useTranslation();
  const recovered = useRef(drafts.read(initial.id));
  const canRestore =
    !!recovered.current &&
    recovered.current.revision === initial.revision &&
    !busy(initial.stage);
  const [conflict, setConflict] = useState(!!recovered.current && !canRestore);
  const [doc, setDoc] = useState(() =>
    canRestore
      ? {
          ...initial,
          title: recovered.current!.title,
          segments: recovered.current!.segments,
          speakers: recovered.current!.speakers,
          turns: recovered.current!.turns,
          notes: recovered.current!.notes,
          saved: recovered.current!.saved,
        }
      : initial,
  );
  const [resolving, setResolving] = useState(false);
  const locked = busy(doc.stage) || resolving;
  const [jobOptions, setJobOptions] = useState(initial.options);
  const [notesModel, setNotesModel] = useState(
    initial.options.notes_model || "qwen3.5-9b",
  );
  const [tab, setTab] = useState("transcript");
  const [search, setSearch] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [editing, setEditing] = useState(false);
  const [selectedTurns, setSelectedTurns] = useState<Set<string>>(new Set());
  const [follow, setFollow] = useState(false);
  const [segmentPage, setSegmentPage] = useState(0);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [evidence, setEvidence] = useState<NoteEvidence | null>(null);
  const showEvidence = (
    id: string,
    snapshots: NoteEvidence[] = [],
    revision: number | null = doc.revision,
  ) => {
    const saved = snapshots.find((e) => e.segment_id === id);
    const segment = doc.segments.find((s) => s.id === id);
    if (saved) setEvidence(saved);
    else if (segment)
      setEvidence({
        segment_id: id,
        text: segment.text,
        start: doc.history_id === null ? segment.start : null,
        end: doc.history_id === null ? segment.end : null,
        transcript_revision: revision,
      });
  };
  const [merge, setMerge] = useState<{ from: string; to: string } | null>(null);
  const [undoMerge, setUndoMerge] = useState<Document | null>(null);
  const [playbackPath, setPlaybackPath] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void api
      .playback(initial.id)
      .then((path) => {
        if (current) setPlaybackPath(path);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [initial.id, initial.audio_path]);
  const activeSegment = useRef<string | null>(null);
  const [speed, setSpeed] = useState("1");
  const [saveState, setSaveState] = useState("saved");
  const [exportFormat, setExportFormat] = useState<string | null>(null);
  const [exportContent, setExportContent] = useState({
    original_text: false,
    transcript: true,
    notes: true,
    speakers: true,
  });
  const [exportPreview, setExportPreview] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [remove, setRemove] = useState<"audio" | "all" | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const latest = useRef(initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  const queue = useRef<SaveQueue<Document>>();
  if (!queue.current)
    queue.current = new SaveQueue(async (next) => {
      const saved = await api.edit({
        id: next.id,
        expected_revision: latest.current.revision,
        title: next.title,
        segments: next.segments,
        speakers: next.speakers,
        notes: next.notes,
        turns: next.turns,
        saved: next.saved,
      });
      latest.current = saved;
      const pending = queue.current!.queued;
      if (pending) {
        pending.revision = saved.revision;
        drafts.write(pending);
      } else {
        drafts.remove(saved.id);
        if (mounted.current) setDoc(saved);
      }
      onUpdated();
    });
  const flush = async (): Promise<boolean> => {
    try {
      await queue.current!.flush();
      if (mounted.current) setSaveState("saved");
      return true;
    } catch (error) {
      if (mounted.current) setSaveState("saveFailed");
      toast.error(String(error));
      return false;
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    if (!exportFormat) return;
    let current = true;
    setPreviewLoading(true);
    setPreviewError("");
    void (async () => {
      if (!(await flushRef.current()))
        throw new Error(t("workspace.saveFailed"));
      return api.exportPreview(initial.id, exportFormat, {
        ...exportContent,
        transcript:
          ["txt", "srt", "vtt"].includes(exportFormat) ||
          exportContent.transcript,
      });
    })()
      .then((text) => {
        if (current) setExportPreview(text);
      })
      .catch((error) => {
        if (current) setPreviewError(String(error));
      })
      .finally(() => {
        if (current) setPreviewLoading(false);
      });
    return () => {
      current = false;
    };
  }, [exportFormat, exportContent, initial.id, t]);
  useEffect(() => {
    const barrier = () => flushRef.current();
    saveBarrier.current = barrier;
    return () => {
      if (saveBarrier.current === barrier) saveBarrier.current = null;
    };
  }, [saveBarrier]);
  useEffect(() => {
    mounted.current = true;
    if (canRestore) {
      queue.current!.enqueue(doc);
      void flushRef.current();
    }
    return () => {
      mounted.current = false;
      clearTimeout(saveTimer.current);
      void flushRef.current();
    };
  }, []);
  const change = (next: Document) => {
    if (busy(next.stage) || resolving) return;
    setDoc(next);
    drafts.write({ ...next, revision: latest.current.revision });
    queue.current!.enqueue(next);
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushRef.current(), 600);
  };
  const seek = (seconds: number) => {
    const index = doc.segments.findIndex(
      (s) => s.start <= seconds && s.end >= seconds,
    );
    if (index >= 0) setSegmentPage(Math.floor(index / 100));
    requestAnimationFrame(() => {
      const segment = doc.segments.find(
        (s) => s.start <= seconds && s.end >= seconds,
      );
      if (segment)
        document
          .getElementById(`${doc.id}-${segment.id}`)
          ?.scrollIntoView({ block: "center" });
    });
    if (audio.current) {
      audio.current.currentTime = seconds;
      void audio.current.play().catch(() => {});
    }
  };
  const doExport = async (format: string) => {
    if (!(await flush())) return;
    try {
      const path = await save({
        defaultPath: `${latest.current.title.replace(/[/\\:]/g, "-")}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (path) {
        await api.export(doc.id, format, path, {
          ...exportContent,
          transcript:
            ["txt", "srt", "vtt"].includes(format) || exportContent.transcript,
        });
        toast.success(t("workspace.exported"));
      }
    } catch (error) {
      toast.error(String(error));
    }
  };
  const resolveNotes = async (
    accept: boolean,
    section: "summary" | "decisions" | "actions" | null = null,
  ) => {
    setResolving(true);
    try {
      if (!(await flush())) return;
      const updated = await api.resolveNotes(
        doc.id,
        accept,
        latest.current.revision,
        section,
      );
      latest.current = updated;
      setDoc(updated);
      onUpdated();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setResolving(false);
    }
  };
  const generateNotes = async (section: NotesSection | null = null) => {
    if (!(await flush())) return;
    try {
      await api.retry(doc.id, true, notesModel, null, section);
      onUpdated();
      onBack();
    } catch (error) {
      toast.error(String(error));
    }
  };
  const regenerateSection = (section: NotesSection) => (
    <button
      className="ws-secondary"
      disabled={locked || !!doc.notes_candidate}
      aria-label={`${t("workspace.regenerate")}: ${t(`workspace.${section}`)}`}
      onClick={() => void generateNotes(section)}
    >
      <RotateCcw size={14} />
      {t("workspace.regenerate")}
    </button>
  );
  const editNotes = (notes: Notes) =>
    change({ ...doc, notes: { ...notes, reviewed: false } });
  const matches = useMemo(
    () =>
      doc.segments.filter(
        (s) =>
          search &&
          s.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [doc.segments, search],
  );
  const visibleSegments = doc.segments.slice(
    segmentPage * 100,
    (segmentPage + 1) * 100,
  );
  const findMatch = (direction: number) => {
    if (!matches.length) return;
    const index =
      matchIndex < 0
        ? direction > 0
          ? 0
          : matches.length - 1
        : (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(index);
    seek(matches[index].start);
  };
  const playbackUpdate = (seconds: number) => {
    let left = 0,
      right = doc.segments.length - 1,
      index = -1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      if (doc.segments[mid].start <= seconds) {
        index = mid;
        left = mid + 1;
      } else right = mid - 1;
    }
    const segment = doc.segments[index];
    const id = segment && seconds < segment.end ? segment.id : null;
    if (activeSegment.current !== id) {
      activeSegment.current = id;
      setPlayhead(seconds);
      if (follow && segment) {
        setSegmentPage(Math.floor(index / 100));
        requestAnimationFrame(() =>
          document
            .getElementById(`${doc.id}-${segment.id}`)
            ?.scrollIntoView({ block: "center" }),
        );
      }
    }
  };
  return (
    <article className="ws-transcript">
      {conflict && (
        <div className="ws-alert" role="alert">
          <p>{t("workspace.draftConflict")}</p>
          <button
            disabled={locked}
            onClick={() => {
              const draft = recovered.current;
              if (draft) {
                change({
                  ...doc,
                  title: draft.title,
                  segments: doc.segments.map((s) => ({
                    ...s,
                    text:
                      draft.segments.find((d) => d.id === s.id)?.text ?? s.text,
                  })),
                });
              }
              setConflict(false);
            }}
          >
            {t("workspace.recoverDraft")}
          </button>
          <button
            onClick={async () => {
              try {
                await drafts.discard(doc.id);
                setConflict(false);
              } catch (error) {
                toast.error(String(error));
              }
            }}
          >
            {t("workspace.keepSaved")}
          </button>
        </div>
      )}
      <div className="ws-toolbar">
        <button
          className="ws-text-button"
          onClick={async () => {
            if (await flush()) onBack();
          }}
        >
          <ArrowLeft size={16} />
          {t("workspace.back")}
        </button>
        <span className="ws-save-state" role="status">
          {t(`workspace.${saveState}`)}
        </span>
        {saveState === "saveFailed" && (
          <button onClick={() => void flush()}>{t("workspace.retry")}</button>
        )}
        <button
          className="ws-icon-button"
          aria-label={t("workspace.saved")}
          aria-pressed={doc.saved}
          disabled={locked}
          onClick={() => change({ ...doc, saved: !doc.saved })}
        >
          <Bookmark size={17} fill={doc.saved ? "currentColor" : "none"} />
        </button>
        <div className="ws-export">
          <Download size={16} aria-hidden="true" />
          <Dropdown
            selectedValue={null}
            placeholder={t("workspace.export")}
            ariaLabel={t("workspace.export")}
            options={(doc.history_id
              ? ["txt", "md", "json"]
              : ["txt", "md", "srt", "vtt", "json"]
            ).map((f) => ({
              value: f,
              label: f.toUpperCase(),
            }))}
            onSelect={setExportFormat}
          />
        </div>
        <button
          className="ws-icon-button"
          aria-label={t("workspace.delete")}
          onClick={() => setRemove("all")}
          disabled={locked}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <input
        className="ws-title-input"
        dir="auto"
        aria-label={t("workspace.title")}
        value={doc.title}
        disabled={locked}
        onChange={(e) => change({ ...doc, title: e.target.value })}
      />
      <p className="ws-meta">
        {t(`workspace.source.${doc.source}`)} ·{" "}
        {new Date(doc.created_at * 1000).toLocaleDateString()} ·{" "}
        {duration(doc.duration)} · {t("workspace.localOnly")}
      </p>
      {(doc.error ||
        ["failed", "cancelled", "interrupted"].includes(doc.stage)) && (
        <div role="alert" className="ws-alert">
          <p>{doc.error ?? t(`workspace.stage.${doc.stage}`)}</p>
          <details>
            <summary>{t("workspace.processing")}</summary>
            <div className="ws-form-grid">
              <Dropdown
                ariaLabel={t("workspace.transcriptionModel")}
                disabled={doc.segments.length > 0}
                selectedValue={jobOptions.model}
                options={[
                  { value: "qwen3-asr", label: "Qwen3 ASR · 1.7B" },
                  { value: "large", label: "Whisper large-v3" },
                  {
                    value: "native",
                    label: t("workspace.currentDictationModel"),
                  },
                ]}
                onSelect={(model) => setJobOptions({ ...jobOptions, model })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={jobOptions.speakers}
                  onChange={(event) =>
                    setJobOptions({
                      ...jobOptions,
                      speakers: event.target.checked,
                    })
                  }
                />
                {t("workspace.detectSpeakers")}
              </label>
              <Dropdown
                ariaLabel={t("workspace.localNotes")}
                selectedValue={jobOptions.notes_model ?? ""}
                options={[
                  { value: "", label: t("workspace.noAutomaticNotes") },
                  { value: "qwen3.5-9b", label: t("workspace.notesModel9") },
                  { value: "qwen3.6-27b", label: t("workspace.notesModel27") },
                ]}
                onSelect={(model) =>
                  setJobOptions({ ...jobOptions, notes_model: model || null })
                }
              />
            </div>
          </details>
          <button
            disabled={locked}
            onClick={async () => {
              if (!(await flush())) return;
              try {
                await api.configure(doc.id, jobOptions);
                await api.retry(doc.id);
                onUpdated();
                onBack();
              } catch (e) {
                toast.error(String(e));
              }
            }}
          >
            {t("workspace.retry")}
          </button>
          <button
            onClick={async () => {
              if (await flush()) onSetupModels();
            }}
          >
            {t("workspace.setupModels")}
          </button>
        </div>
      )}
      {busy(doc.stage) && (
        <div className="ws-alert" role="status">
          {t(`workspace.stage.${doc.stage}`)}
        </div>
      )}
      {doc.audio_path && (
        <div className="ws-player">
          <AudioPlayer
            className="ws-player-transport"
            src={playbackPath ? convertFileSrc(playbackPath) : undefined}
            mediaRef={audio}
            playbackRate={Number(speed)}
            onTimeChange={playbackUpdate}
          />
          <Dropdown
            ariaLabel={t("workspace.speed")}
            selectedValue={speed}
            options={["0.75", "1", "1.25", "1.5", "2"].map((v) => ({
              value: v,
              label: `${v}\u00d7`,
            }))}
            onSelect={setSpeed}
          />
          <button
            className="ws-text-button"
            disabled={locked}
            onClick={() => setRemove("audio")}
          >
            {t("workspace.deleteAudio")}
          </button>
        </div>
      )}
      {(doc.stage_errors ?? []).map((issue, index) => (
        <div className="ws-alert" role="status" key={index}>
          <strong>{t("workspace.transcriptReadyWarning")}</strong>
          <p>{issue.message}</p>
          <button
            disabled={locked}
            onClick={async () => {
              if (!(await flush())) return;
              try {
                await api.retry(
                  doc.id,
                  issue.stage === "notes",
                  issue.stage === "notes" ? notesModel : null,
                  issue.stage,
                );
                onUpdated();
                onBack();
              } catch (error) {
                toast.error(String(error));
              }
            }}
          >
            {t("workspace.retryEnhancement")}
          </button>
          <button
            onClick={async () => {
              if (await flush()) onSetupModels();
            }}
          >
            {t("workspace.setupModels")}
          </button>
          <button
            disabled={locked}
            onClick={async () => {
              if (!(await flush())) return;
              try {
                await api.configure(doc.id, {
                  ...doc.options,
                  speakers:
                    issue.stage === "diarizing" ? false : doc.options.speakers,
                  notes_model:
                    issue.stage === "notes" ? null : doc.options.notes_model,
                });
                await api.retry(doc.id);
                onUpdated();
                onBack();
              } catch (error) {
                toast.error(String(error));
              }
            }}
          >
            {t("workspace.skipEnhancement")}
          </button>
        </div>
      ))}
      <div className="ws-review-controls">
        <button
          className="ws-secondary"
          disabled={locked}
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          {t(editing ? "workspace.finishEditing" : "workspace.editTranscript")}
        </button>
        {doc.audio_path && (
          <button
            className="ws-text-button"
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
          >
            {t("workspace.followPlayback")}
          </button>
        )}
      </div>
      <div
        className="ws-tabs"
        role="tablist"
        aria-label={t("workspace.documentViews")}
      >
        {["transcript", "notes", "speakers"].map((view) => (
          <button
            key={view}
            role="tab"
            aria-selected={tab === view}
            id={`tab-${view}`}
            aria-controls={`panel-${view}`}
            tabIndex={tab === view ? 0 : -1}
            onKeyDown={(e) => {
              const views = ["transcript", "notes", "speakers"];
              let index = views.indexOf(view);
              const rtl = document.documentElement.dir === "rtl";
              if (e.key === "ArrowRight") index = (index + (rtl ? 2 : 1)) % 3;
              else if (e.key === "ArrowLeft")
                index = (index + (rtl ? 1 : 2)) % 3;
              else if (e.key === "Home") index = 0;
              else if (e.key === "End") index = 2;
              else return;
              e.preventDefault();
              setTab(views[index]);
              requestAnimationFrame(() =>
                document.getElementById(`tab-${views[index]}`)?.focus(),
              );
            }}
            onClick={() => setTab(view)}
          >
            {view === "speakers" ? <Users size={16} /> : <FileText size={16} />}{" "}
            {t(`workspace.${view}`)}
          </button>
        ))}
      </div>
      {tab === "transcript" && (
        <section
          id="panel-transcript"
          role="tabpanel"
          aria-labelledby="tab-transcript"
        >
          <label className="ws-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setMatchIndex(-1);
              }}
              placeholder={t("workspace.searchTranscript")}
              aria-label={t("workspace.searchTranscript")}
            />
          </label>
          {search && (
            <div className="ws-find-controls">
              <span>
                {t("workspace.matchCount", { count: matches.length })}
              </span>
              <button disabled={!matches.length} onClick={() => findMatch(-1)}>
                {t("workspace.previous")}
              </button>
              <button disabled={!matches.length} onClick={() => findMatch(1)}>
                {t("workspace.next")}
              </button>
            </div>
          )}
          {!doc.segments.length && (
            <p className="ws-empty-copy">
              {t(
                doc.segments.length
                  ? "workspace.noResults"
                  : "workspace.transcriptPending",
              )}
            </p>
          )}
          <div className="ws-segments">
            {editing && doc.speakers.length > 0 && (
              <div className="ws-bulk-speakers">
                <button
                  disabled={locked}
                  onClick={() =>
                    setSelectedTurns(new Set(visibleSegments.map((s) => s.id)))
                  }
                >
                  {t("workspace.selectPage")}
                </button>
                <button
                  disabled={!selectedTurns.size}
                  onClick={() => setSelectedTurns(new Set())}
                >
                  {t("workspace.clearSelection")}
                </button>
                <span role="status">
                  {t("workspace.selectedTurns")}: {selectedTurns.size}
                </span>
                <Dropdown
                  ariaLabel={t("workspace.assignSelectedSpeaker")}
                  disabled={locked || !selectedTurns.size}
                  selectedValue={null}
                  placeholder={t("workspace.assignSelectedSpeaker")}
                  options={doc.speakers.map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                  onSelect={(speaker) => {
                    change({
                      ...doc,
                      segments: doc.segments.map((s) =>
                        selectedTurns.has(s.id) ? { ...s, speaker } : s,
                      ),
                    });
                    setSelectedTurns(new Set());
                  }}
                />
              </div>
            )}
            {visibleSegments.map((segment) => (
              <div
                key={segment.id}
                id={`${doc.id}-${segment.id}`}
                className={`ws-segment ${playhead >= segment.start && playhead < segment.end ? "is-playing" : ""}`}
              >
                <button
                  className="ws-timestamp"
                  onClick={() => seek(segment.start)}
                  disabled={!doc.audio_path}
                >
                  {duration(segment.start)}
                </button>
                <button
                  className="ws-evidence-trigger"
                  aria-label={t("workspace.evidence")}
                  onClick={() => showEvidence(segment.id)}
                >
                  <FileText size={14} />
                </button>
                <div className="ws-segment-content">
                  {editing && (
                    <label className="ws-turn-selection">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={selectedTurns.has(segment.id)}
                        onChange={(event) =>
                          setSelectedTurns((previous) => {
                            const next = new Set(previous);
                            if (event.target.checked) next.add(segment.id);
                            else next.delete(segment.id);
                            return next;
                          })
                        }
                      />
                      {t("workspace.selectTurn", {
                        time: duration(segment.start),
                      })}
                    </label>
                  )}
                  {doc.speakers.length > 0 && editing && (
                    <Dropdown
                      ariaLabel={t("workspace.speaker")}
                      disabled={locked}
                      selectedValue={segment.speaker ?? ""}
                      options={[
                        { value: "", label: t("workspace.unknownSpeaker") },
                        ...doc.speakers.map((s) => ({
                          value: s.id,
                          label: s.name,
                        })),
                      ]}
                      onSelect={(value) =>
                        change({
                          ...doc,
                          segments: doc.segments.map((s) =>
                            s.id === segment.id
                              ? { ...s, speaker: value || null }
                              : s,
                          ),
                        })
                      }
                    />
                  )}
                  {!editing && (
                    <div className="ws-reading-turn">
                      <strong>
                        {
                          doc.speakers.find((s) => s.id === segment.speaker)
                            ?.name
                        }
                      </strong>
                      <p
                        dir="auto"
                        className={
                          search &&
                          segment.text
                            .toLocaleLowerCase()
                            .includes(search.toLocaleLowerCase())
                            ? "ws-match"
                            : ""
                        }
                      >
                        {segment.text}
                      </p>
                    </div>
                  )}
                  {editing && (
                    <textarea
                      dir="auto"
                      aria-label={`${t("workspace.segment")} ${duration(segment.start)}`}
                      value={segment.text}
                      disabled={locked}
                      rows={Math.max(2, Math.ceil(segment.text.length / 95))}
                      onChange={(e) =>
                        change({
                          ...doc,
                          segments: doc.segments.map((s) =>
                            s.id === segment.id
                              ? { ...s, text: e.target.value }
                              : s,
                          ),
                        })
                      }
                    />
                  )}
                  {editing && segment.text !== segment.original_text && (
                    <button
                      className="ws-text-button ws-restore"
                      onClick={() =>
                        change({
                          ...doc,
                          segments: doc.segments.map((s) =>
                            s.id === segment.id
                              ? { ...s, text: s.original_text }
                              : s,
                          ),
                        })
                      }
                    >
                      <RotateCcw size={12} />
                      {t("workspace.restoreOriginal")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {doc.segments.length > 100 && (
            <div className="ws-pagination">
              <button
                disabled={segmentPage === 0}
                onClick={() => setSegmentPage(segmentPage - 1)}
              >
                {t("workspace.previous")}
              </button>
              <span>
                {segmentPage + 1} / {Math.ceil(doc.segments.length / 100)}
              </span>
              <button
                disabled={(segmentPage + 1) * 100 >= doc.segments.length}
                onClick={() => setSegmentPage(segmentPage + 1)}
              >
                {t("workspace.next")}
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "speakers" && (
        <section
          className="ws-speakers"
          id="panel-speakers"
          role="tabpanel"
          aria-labelledby="tab-speakers"
        >
          <fieldset disabled={locked}>
            <p>{t("workspace.speakerHelp")}</p>
            {!doc.speakers.length && (
              <p className="ws-empty-copy">{t("workspace.noSpeakers")}</p>
            )}
            <button
              className="ws-secondary"
              onClick={() =>
                change({
                  ...doc,
                  speakers: [
                    ...doc.speakers,
                    {
                      id: `manual-${Date.now()}`,
                      name: t("workspace.newSpeaker"),
                    },
                  ],
                })
              }
            >
              {t("workspace.newSpeaker")}
            </button>
            {doc.speakers.map((s) => (
              <div className="ws-speaker-row" key={s.id}>
                <span className="ws-speaker-avatar">
                  <Users size={18} />
                </span>
                <input
                  aria-label={t("workspace.speakerName")}
                  value={s.name}
                  onChange={(e) =>
                    change({
                      ...doc,
                      speakers: doc.speakers.map((x) =>
                        x.id === s.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <button
                  disabled={
                    !playbackPath ||
                    !doc.segments.some((turn) => turn.speaker === s.id)
                  }
                  onClick={() =>
                    seek(
                      doc.segments.find((turn) => turn.speaker === s.id)
                        ?.start ?? 0,
                    )
                  }
                >
                  {t("workspace.speakerSample")}
                </button>
                <Dropdown
                  selectedValue={null}
                  placeholder={t("workspace.mergeSpeaker")}
                  ariaLabel={t("workspace.mergeSpeaker")}
                  options={doc.speakers
                    .filter((x) => x.id !== s.id)
                    .map((x) => ({ value: x.id, label: x.name }))}
                  onSelect={(target) => setMerge({ from: s.id, to: target })}
                />
              </div>
            ))}
            {undoMerge && (
              <button
                onClick={() => {
                  change({
                    ...doc,
                    speakers: undoMerge.speakers,
                    segments: doc.segments.map((segment) => ({
                      ...segment,
                      speaker:
                        undoMerge.segments.find((old) => old.id === segment.id)
                          ?.speaker ?? null,
                    })),
                    turns: undoMerge.turns,
                  });
                  setUndoMerge(null);
                }}
              >
                {t("workspace.undoMerge")}
              </button>
            )}
          </fieldset>
        </section>
      )}
      {tab === "notes" && (
        <section
          className="ws-notes"
          id="panel-notes"
          role="tabpanel"
          aria-labelledby="tab-notes"
        >
          <fieldset disabled={locked}>
            {doc.notes_candidate && (
              <section
                className="ws-notes-candidate"
                aria-label={t("workspace.newNotesReview")}
              >
                <h2>{t("workspace.newNotesReview")}</h2>
                <p>{t("workspace.newNotesHelp")}</p>
                {doc.notes_candidate.transcript_revision !== doc.revision && (
                  <p role="status">{t("workspace.notesStale")}</p>
                )}
                {(["summary", "decisions", "actions"] as const)
                  .filter(
                    (section) =>
                      !doc.notes_candidate?.generated_section ||
                      doc.notes_candidate.generated_section === section,
                  )
                  .map((section) => (
                    <div key={section}>
                      <h3>{t(`workspace.${section}`)}</h3>
                      <button
                        disabled={
                          locked ||
                          doc.notes_candidate!.transcript_revision !==
                            doc.revision
                        }
                        aria-label={`${t("workspace.replaceOnlySection")}: ${t(`workspace.${section}`)}`}
                        onClick={() => void resolveNotes(true, section)}
                      >
                        {t("workspace.replaceOnlySection")}
                      </button>
                      <p className="ws-meta">
                        {t("workspace.sectionReplacementHelp")}
                      </p>
                      {doc.notes_candidate![section].map((item, index) => (
                        <div className="ws-note-preview" key={index}>
                          <p dir="auto">{item.text}</p>
                          {"owner" in item && (item.owner || item.due) && (
                            <p>
                              {[item.owner, item.due]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          <div className="ws-citations">
                            {item.sources.map((id) => (
                              <button
                                key={id}
                                onClick={() => showEvidence(id, item.evidence)}
                              >
                                {duration(
                                  doc.segments.find(
                                    (segment) => segment.id === id,
                                  )?.start ?? 0,
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                <div className="ws-actions">
                  {!doc.notes_candidate.generated_section && (
                    <button
                      className="ws-primary"
                      disabled={
                        doc.notes_candidate.transcript_revision !== doc.revision
                      }
                      onClick={() => void resolveNotes(true)}
                    >
                      {t("workspace.replaceNotes")}
                    </button>
                  )}
                  <button
                    className="ws-secondary"
                    onClick={() => void resolveNotes(false)}
                  >
                    {t("workspace.keepCurrentNotes")}
                  </button>
                </div>
              </section>
            )}
            {doc.notes && doc.notes.transcript_revision !== doc.revision && (
              <p className="ws-alert">{t("workspace.notesStale")}</p>
            )}
            {doc.notes && (
              <label className="ws-notes-reviewed">
                <input
                  type="checkbox"
                  checked={
                    doc.notes.reviewed &&
                    doc.notes.transcript_revision === doc.revision
                  }
                  disabled={
                    locked || doc.notes.transcript_revision !== doc.revision
                  }
                  onChange={(event) =>
                    change({
                      ...doc,
                      notes: { ...doc.notes!, reviewed: event.target.checked },
                    })
                  }
                />
                {t("workspace.notesReviewed")}
              </label>
            )}
            {!doc.notes && (
              <p className="ws-empty-copy">{t("workspace.noNotes")}</p>
            )}
            {!locked && doc.segments.length > 0 && (
              <div className="ws-actions">
                <Dropdown
                  ariaLabel={t("workspace.notes")}
                  selectedValue={notesModel}
                  options={[
                    { value: "qwen3.5-9b", label: t("workspace.notesModel9") },
                    {
                      value: "qwen3.6-27b",
                      label: t("workspace.notesModel27"),
                    },
                  ]}
                  onSelect={setNotesModel}
                />
                <button
                  className="ws-secondary"
                  disabled={!!doc.notes_candidate}
                  onClick={() => void generateNotes()}
                >
                  <RotateCcw size={15} />
                  {t(
                    doc.notes
                      ? "workspace.regenerate"
                      : "workspace.generateNotes",
                  )}
                </button>
              </div>
            )}
            {doc.notes && (
              <>
                {(["summary", "decisions"] as const).map((key) => (
                  <div key={key}>
                    <div className="ws-actions">
                      <h2>{t(`workspace.${key}`)}</h2>
                      {regenerateSection(key)}
                    </div>
                    {doc.notes![key].map((item, index) => (
                      <div key={index} className="ws-note-item">
                        <textarea
                          dir="auto"
                          aria-label={t(`workspace.${key}`)}
                          value={item.text}
                          onChange={(e) =>
                            editNotes({
                              ...doc.notes!,
                              [key]: doc.notes![key].map((x, i) =>
                                i === index
                                  ? { ...x, text: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                        <button
                          onClick={() =>
                            editNotes({
                              ...doc.notes!,
                              [key]: doc.notes![key].filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          {t("workspace.removeItem")}
                        </button>
                        <div className="ws-citations">
                          {item.sources.map((id) => (
                            <button
                              key={id}
                              onClick={() => showEvidence(id, item.evidence)}
                            >
                              {duration(
                                doc.segments.find((s) => s.id === id)?.start ??
                                  0,
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="ws-actions">
                  <h2>{t("workspace.actions")}</h2>
                  {regenerateSection("actions")}
                </div>
                {doc.notes.actions.map((item, index) => (
                  <div key={index} className="ws-note-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) =>
                          editNotes({
                            ...doc.notes!,
                            actions: doc.notes!.actions.map((x, i) =>
                              i === index
                                ? { ...x, done: e.target.checked }
                                : x,
                            ),
                          })
                        }
                      />
                      <span>{t("workspace.done")}</span>
                    </label>
                    <textarea
                      dir="auto"
                      aria-label={t("workspace.action")}
                      value={item.text}
                      onChange={(e) =>
                        editNotes({
                          ...doc.notes!,
                          actions: doc.notes!.actions.map((x, i) =>
                            i === index ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        editNotes({
                          ...doc.notes!,
                          actions: doc.notes!.actions.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      {t("workspace.removeItem")}
                    </button>
                    <div className="ws-action-fields">
                      {(["owner", "due"] as const).map((field) => (
                        <input
                          key={field}
                          aria-label={t(`workspace.${field}`)}
                          placeholder={t(`workspace.${field}`)}
                          value={item[field] ?? ""}
                          onChange={(e) =>
                            editNotes({
                              ...doc.notes!,
                              actions: doc.notes!.actions.map((x, i) =>
                                i === index
                                  ? { ...x, [field]: e.target.value || null }
                                  : x,
                              ),
                            })
                          }
                        />
                      ))}
                      {item.sources.map((id) => (
                        <button
                          key={id}
                          onClick={() => showEvidence(id, item.evidence)}
                        >
                          {duration(
                            doc.segments.find((s) => s.id === id)?.start ?? 0,
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </fieldset>
        </section>
      )}
      {evidence && (
        <aside className="ws-evidence" aria-label={t("workspace.evidence")}>
          <h2>{t("workspace.evidence")}</h2>
          <p dir="auto">{evidence.text}</p>
          {doc.segments.find((s) => s.id === evidence.segment_id)?.text !==
            evidence.text && (
            <details>
              <summary>{t("workspace.transcript")}</summary>
              <p dir="auto">
                {doc.segments.find((s) => s.id === evidence.segment_id)?.text}
              </p>
            </details>
          )}
          <button
            disabled={locked}
            onClick={() => {
              const notes = doc.notes ?? {
                summary: [],
                decisions: [],
                actions: [],
                transcript_revision: doc.revision,
                reviewed: false,
              };
              editNotes({
                ...notes,
                summary: [
                  ...notes.summary,
                  {
                    text: evidence.text,
                    sources: [evidence.segment_id],
                    evidence: [evidence],
                  },
                ],
              });
              setTab("notes");
              setEvidence(null);
            }}
          >
            {t("workspace.addItem")}
          </button>
          <button
            disabled={!playbackPath}
            onClick={() => seek(evidence.start ?? 0)}
          >
            {t("workspace.playEvidence")}
          </button>
          <button onClick={() => setEvidence(null)}>
            {t("workspace.close")}
          </button>
        </aside>
      )}
      <ConfirmDialog
        open={!!exportFormat}
        title={t("workspace.exportPreview")}
        kind="dialog"
        confirmDisabled={
          previewLoading ||
          !!previewError ||
          (["md", "json"].includes(exportFormat ?? "") &&
            !exportContent.transcript &&
            (!exportContent.notes || !doc.notes))
        }
        description={`${exportFormat?.toUpperCase() ?? ""} · ${doc.title}`}
        confirmLabel={t("workspace.confirmExport")}
        cancelLabel={t("workspace.cancel")}
        onCancel={() => setExportFormat(null)}
        onConfirm={async () => {
          if (exportFormat) await doExport(exportFormat);
          setExportFormat(null);
        }}
      >
        <fieldset className="ws-export-content">
          <label>
            <input
              type="checkbox"
              checked={exportContent.original_text}
              onChange={(event) =>
                setExportContent({
                  ...exportContent,
                  original_text: event.target.checked,
                })
              }
            />
            {t("workspace.exportOriginalText")}
          </label>
          {(["transcript", "notes", "speakers"] as const)
            .filter(
              (key) =>
                ["md", "json"].includes(exportFormat ?? "") ||
                key === "speakers",
            )
            .map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  disabled={key === "notes" && !doc.notes}
                  checked={exportContent[key]}
                  onChange={(event) =>
                    setExportContent({
                      ...exportContent,
                      [key]: event.target.checked,
                    })
                  }
                />
                {t(`workspace.${key}`)}
              </label>
            ))}
          {doc.notes && doc.notes.transcript_revision !== doc.revision && (
            <p>{t("workspace.notesStale")}</p>
          )}
        </fieldset>
        {previewLoading && <p role="status">{t("workspace.working")}</p>}
        {previewError ? (
          <p role="alert">{previewError}</p>
        ) : (
          <pre
            className="ws-export-preview"
            dir="auto"
            tabIndex={0}
            aria-label={t("workspace.exportPreview")}
          >
            {exportPreview}
          </pre>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!merge}
        title={t("workspace.mergeSpeaker")}
        description={t("workspace.mergePreview", {
          from: doc.speakers.find((s) => s.id === merge?.from)?.name,
          to: doc.speakers.find((s) => s.id === merge?.to)?.name,
          count: doc.segments.filter((s) => s.speaker === merge?.from).length,
        })}
        confirmLabel={t("workspace.mergeSpeaker")}
        cancelLabel={t("workspace.cancel")}
        onCancel={() => setMerge(null)}
        onConfirm={() => {
          if (merge) {
            setUndoMerge(doc);
            change({
              ...doc,
              speakers: doc.speakers.filter((s) => s.id !== merge.from),
              turns: doc.turns.map((turn) =>
                turn.speaker === merge.from
                  ? { ...turn, speaker: merge.to }
                  : turn,
              ),
              segments: doc.segments.map((s) =>
                s.speaker === merge.from ? { ...s, speaker: merge.to } : s,
              ),
            });
          }
          setMerge(null);
        }}
      />
      <ConfirmDialog
        open={remove !== null}
        title={t(
          remove === "audio" ? "workspace.deleteAudio" : "workspace.delete",
        )}
        description={t(
          remove === "audio"
            ? "workspace.deleteAudioHelp"
            : "workspace.deleteHelp",
        )}
        confirmLabel={t("workspace.delete")}
        cancelLabel={t("workspace.cancel")}
        destructive
        onCancel={() => setRemove(null)}
        onConfirm={async () => {
          try {
            if (!(await flush())) return;
            await api.remove(doc.id, remove === "audio");
            drafts.remove(doc.id);
            onUpdated();
            onBack();
          } catch (e) {
            toast.error(String(e));
          }
          setRemove(null);
        }}
      />
    </article>
  );
}
