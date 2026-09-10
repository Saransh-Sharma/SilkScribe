import { useEffect, useRef, useState } from "react";
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
import { toast } from "sonner";
import { api, busy, duration, type Document, type Notes } from "./api";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Dropdown } from "../ui/Dropdown";
import { AudioPlayer } from "../ui/AudioPlayer";

export function Transcript({
  document: initial,
  onBack,
  onUpdated,
}: {
  document: Document;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const { t } = useTranslation();
  const draftKey = `workspace-draft-${initial.id}`;
  const [doc, setDoc] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(draftKey) || "null",
      ) as Document | null;
      if (saved?.id === initial.id && saved.revision === initial.revision)
        return saved;
    } catch {
      /* use the database copy */
    }
    return initial;
  });
  const [notesModel, setNotesModel] = useState(
    initial.options.notes_model || "qwen3.5-9b",
  );
  const [tab, setTab] = useState("transcript");
  const [search, setSearch] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [speed, setSpeed] = useState("1");
  const [saveState, setSaveState] = useState("saved");
  const [remove, setRemove] = useState<"audio" | "all" | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pending = useRef<Document | null>(null);
  const latest = useRef(doc);
  const saving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flush = async () => {
    if (saving.current || !pending.current) return;
    saving.current = true;
    const next = pending.current;
    pending.current = null;
    try {
      const saved = await api.edit({
        id: next.id,
        expected_revision: latest.current.revision,
        title: next.title,
        segments: next.segments,
        speakers: next.speakers,
        notes: next.notes,
        saved: next.saved,
      });
      latest.current = saved;
      if (pending.current) {
        (pending.current as Document).revision = saved.revision;
      } else if (mounted.current) {
        setDoc(saved);
        setSaveState("saved");
        localStorage.removeItem(draftKey);
      }
      onUpdated();
    } catch (error) {
      pending.current = pending.current ?? next;
      if (mounted.current) setSaveState("saveFailed");
      toast.error(String(error));
      saving.current = false;
      return;
    }
    saving.current = false;
    if (pending.current) await flushRef.current();
  };
  flushRef.current = flush;
  useEffect(() => {
    mounted.current = true;
    if (doc !== initial) {
      pending.current = doc;
      void flushRef.current();
    }
    return () => {
      mounted.current = false;
      clearTimeout(saveTimer.current);
      void flushRef.current();
    };
  }, []);
  const change = (next: Document) => {
    setDoc(next);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      /* autosave still writes to SQLite */
    }
    pending.current = next;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushRef.current(), 600);
  };
  const seek = (seconds: number) => {
    setSearch("");
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
    await flush();
    if (pending.current) return;
    try {
      const path = await save({
        defaultPath: `${doc.title.replace(/[/\\:]/g, "-")}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (path) {
        await api.export(doc.id, format, path);
        toast.success(t("workspace.exported"));
      }
    } catch (error) {
      toast.error(String(error));
    }
  };
  const editNotes = (notes: Notes) => change({ ...doc, notes });
  const matches = doc.segments.filter((s) =>
    s.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <article className="ws-transcript">
      <div className="ws-toolbar">
        <button
          className="ws-text-button"
          onClick={async () => {
            await flush();
            if (!pending.current) onBack();
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
          disabled={busy(doc.stage)}
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
            options={["txt", "md", "srt", "vtt", "json"].map((f) => ({
              value: f,
              label: f.toUpperCase(),
            }))}
            onSelect={(format) => void doExport(format)}
          />
        </div>
        <button
          className="ws-icon-button"
          aria-label={t("workspace.delete")}
          onClick={() => setRemove("all")}
          disabled={busy(doc.stage)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <input
        className="ws-title-input"
        aria-label={t("workspace.title")}
        value={doc.title}
        disabled={busy(doc.stage)}
        onChange={(e) => change({ ...doc, title: e.target.value })}
      />
      <p className="ws-meta">
        {t(`workspace.source.${doc.source}`)} ·{" "}
        {new Date(doc.created_at * 1000).toLocaleDateString()} ·{" "}
        {duration(doc.duration)} · {t("workspace.localOnly")}
      </p>
      {doc.error && (
        <div role="alert" className="ws-alert">
          <p>{doc.error}</p>
          <button
            onClick={async () => {
              try {
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
            src={convertFileSrc(doc.audio_path)}
            mediaRef={audio}
            playbackRate={Number(speed)}
            onTimeChange={setPlayhead}
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
            disabled={busy(doc.stage)}
            onClick={() => setRemove("audio")}
          >
            {t("workspace.deleteAudio")}
          </button>
        </div>
      )}
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
            onClick={() => setTab(view)}
          >
            {view === "speakers" ? <Users size={16} /> : <FileText size={16} />}{" "}
            {t(`workspace.${view}`)}
          </button>
        ))}
      </div>
      {tab === "transcript" && (
        <section aria-label={t("workspace.transcript")}>
          <label className="ws-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("workspace.searchTranscript")}
              aria-label={t("workspace.searchTranscript")}
            />
          </label>
          {!matches.length && (
            <p className="ws-empty-copy">
              {t(
                doc.segments.length
                  ? "workspace.noResults"
                  : "workspace.transcriptPending",
              )}
            </p>
          )}
          <div className="ws-segments">
            {matches.map((segment) => (
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
                <div className="ws-segment-content">
                  {doc.speakers.length > 0 && (
                    <Dropdown
                      ariaLabel={t("workspace.speaker")}
                      disabled={busy(doc.stage)}
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
                  <textarea
                    aria-label={`${t("workspace.segment")} ${duration(segment.start)}`}
                    value={segment.text}
                    disabled={busy(doc.stage)}
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
                  {segment.text !== segment.original_text && (
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
        </section>
      )}
      {tab === "speakers" && (
        <section className="ws-speakers">
          <p>{t("workspace.speakerHelp")}</p>
          {!doc.speakers.length && (
            <p className="ws-empty-copy">{t("workspace.noSpeakers")}</p>
          )}
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
              <Dropdown
                selectedValue={null}
                placeholder={t("workspace.mergeSpeaker")}
                ariaLabel={t("workspace.mergeSpeaker")}
                options={doc.speakers
                  .filter((x) => x.id !== s.id)
                  .map((x) => ({ value: x.id, label: x.name }))}
                onSelect={(target) =>
                  change({
                    ...doc,
                    speakers: doc.speakers.filter((x) => x.id !== s.id),
                    segments: doc.segments.map((x) =>
                      x.speaker === s.id ? { ...x, speaker: target } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
        </section>
      )}
      {tab === "notes" && (
        <section className="ws-notes">
          {doc.notes && doc.notes.transcript_revision !== doc.revision && (
            <p className="ws-alert">{t("workspace.notesStale")}</p>
          )}
          {!doc.notes && (
            <p className="ws-empty-copy">{t("workspace.noNotes")}</p>
          )}
          {!busy(doc.stage) && doc.segments.length > 0 && (
            <div className="ws-actions">
              <Dropdown
                ariaLabel={t("workspace.notes")}
                selectedValue={notesModel}
                options={[
                  { value: "qwen3.5-9b", label: t("workspace.notesModel9") },
                  { value: "qwen3.6-27b", label: t("workspace.notesModel27") },
                ]}
                onSelect={setNotesModel}
              />
              <button
                className="ws-secondary"
                onClick={async () => {
                  await flush();
                  if (pending.current) return;
                  try {
                    await api.retry(doc.id, true, notesModel);
                    onUpdated();
                    onBack();
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                <RotateCcw size={15} />
                {t("workspace.regenerate")}
              </button>
            </div>
          )}
          {doc.notes && (
            <>
              {(["summary", "decisions"] as const).map((key) => (
                <div key={key}>
                  <h2>{t(`workspace.${key}`)}</h2>
                  {doc.notes![key].map((item, index) => (
                    <div key={index} className="ws-note-item">
                      <textarea
                        aria-label={t(`workspace.${key}`)}
                        value={item.text}
                        onChange={(e) =>
                          editNotes({
                            ...doc.notes!,
                            [key]: doc.notes![key].map((x, i) =>
                              i === index ? { ...x, text: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <div className="ws-citations">
                        {item.sources.map((id) => (
                          <button
                            key={id}
                            onClick={() => {
                              setTab("transcript");
                              seek(
                                doc.segments.find((s) => s.id === id)?.start ??
                                  0,
                              );
                            }}
                          >
                            {duration(
                              doc.segments.find((s) => s.id === id)?.start ?? 0,
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <h2>{t("workspace.actions")}</h2>
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
                            i === index ? { ...x, done: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                    <span>{t("workspace.done")}</span>
                  </label>
                  <textarea
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
                        onClick={() => {
                          setTab("transcript");
                          seek(
                            doc.segments.find((s) => s.id === id)?.start ?? 0,
                          );
                        }}
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
        </section>
      )}
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
            await api.remove(doc.id, remove === "audio");
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
