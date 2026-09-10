import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Home,
  Library,
  Settings,
  Mic,
  Upload,
  Search,
  ArrowUpRight,
  Headphones,
  Pause,
  Square,
  Play,
  Check,
  ArrowLeft,
  X,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import SilkScribeWordmark from "../icons/SilkScribeWordmark";
import type { SidebarSection } from "../Sidebar";
import {
  api,
  busy,
  duration,
  type Document,
  type JobOptions,
  type RecordingStatus,
  type CaptureDevice,
  type ModelPack,
} from "./api";
import { Transcript } from "./Transcript";
import { Preferences } from "./Preferences";
import { WsMeter, WsSelect, WsToggle } from "./controls";
import { useSettings } from "@/hooks/useSettings";
import "./workspace.css";

const DEFAULT_OPTIONS: JobOptions = {
  model: "qwen3-asr",
  language: "auto",
  speakers: true,
  notes_model: null,
};
/** Languages the transcription workers accept, plus auto-detect. */
const TRANSCRIPTION_LANGUAGES = [
  "auto",
  "English",
  "Chinese",
  "Cantonese",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Korean",
  "Portuguese",
  "Russian",
  "Spanish",
];

export default function Workspace({
  renderSettings,
  onSetupDictation,
}: {
  renderSettings: (
    section: SidebarSection,
    navigate: (section: SidebarSection) => void,
  ) => ReactNode;
  onSetupDictation: () => void;
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [page, setPage] = useState("home");
  const [settingsPage, setSettingsPage] = useState<
    SidebarSection | "local" | "audio" | "appearance"
  >("general");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [jobs, setJobs] = useState<Document[]>([]);
  const [selected, setSelected] = useState<Document | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [create, setCreate] = useState<"meeting" | "import" | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [options, setOptions] = useState<JobOptions>(DEFAULT_OPTIONS);
  const [title, setTitle] = useState("");
  const [device, setDevice] = useState("");
  const [system, setSystem] = useState(true);
  const [devices, setDevices] = useState<CaptureDevice[]>([]);
  const [recording, setRecording] = useState<RecordingStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [packs, setPacks] = useState<ModelPack[]>([]);
  const [runtime, setRuntime] = useState(false);
  const [download, setDownload] = useState<{
    id: string;
    downloaded: number;
    total: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++request.current;
    try {
      const [items, activeJobs] = await Promise.all([
        api.list(query, filter),
        api.list("", "jobs"),
      ]);
      if (ticket !== request.current) return;
      setDocuments(items);
      setJobs(activeJobs);
      setMore(items.length === 100);
      setError("");
    } catch (e) {
      if (ticket === request.current) setError(String(e));
    } finally {
      if (ticket === request.current) setLoading(false);
    }
  }, [query, filter]);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void refresh(), 150);
    return () => clearTimeout(timer);
  }, [refresh]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const loadPacks = async () => {
    try {
      const [models, ready] = await Promise.all([api.packs(), api.runtime()]);
      setPacks(models);
      setRuntime(ready);
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void loadPacks();
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const register = async () => {
      for (const [event, handler] of [
        [
          "workspace-updated",
          () => {
            void refreshRef.current();
            const doc = selectedRef.current;
            if (doc && busy(doc.stage)) {
              void api
                .get(doc.id)
                .then(setSelected)
                .catch(() => {});
            }
          },
        ],
        [
          "history-updated",
          () => {
            void refreshRef.current();
          },
        ],
        [
          "workspace-recording-conflict",
          () => toast.info(t("workspace.recordingConflict")),
        ],
      ] as const) {
        const off = await listen(event, handler);
        if (disposed) off();
        else cleanups.push(off);
      }
      const off = await listen<{
        id: string;
        downloaded: number;
        total: number;
      }>("workspace-download", (event) => setDownload(event.payload));
      if (disposed) off();
      else cleanups.push(off);
    };
    void register().catch(() => {});
    try {
      void getCurrentWebviewWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type === "over" || event.payload.type === "enter")
            setDragging(true);
          if (event.payload.type === "leave") setDragging(false);
          if (event.payload.type === "drop") {
            setDragging(false);
            setFiles(event.payload.paths);
            setCreate("import");
            setSelected(null);
          }
        })
        .then((off) => {
          if (disposed) off();
          else cleanups.push(off);
        })
        .catch(() => {});
    } catch {
      /* browser fixtures have no native window */
    }
    return () => {
      disposed = true;
      cleanups.forEach((off) => off());
    };
  }, [t]);
  useEffect(() => {
    let disposed = false;
    let running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const status = await api.status();
        if (!disposed) setRecording(status);
      } catch {
        /* recording capability may be unavailable */
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  const navigate = (next: string) => {
    setPage(next);
    setSelected(null);
    setCreate(null);
    setQuery("");
    setFilter("all");
  };
  const chooseFiles = async () => {
    try {
      const result = await open({
        multiple: true,
        filters: [
          {
            name: t("workspace.audioFiles"),
            extensions: ["wav", "mp3", "m4a", "flac", "ogg"],
          },
        ],
      });
      if (result) {
        setFiles(Array.isArray(result) ? result : [result]);
        setCreate("import");
        setSelected(null);
      }
    } catch (e) {
      toast.error(String(e));
    }
  };
  const beginMeeting = async () => {
    setCreate("meeting");
    setSelected(null);
    try {
      setDevices(await api.devices());
    } catch (e) {
      toast.error(String(e));
    }
  };
  const submit = async () => {
    setWorking(true);
    try {
      if (create === "meeting") {
        setRecording(
          await api.start({
            title,
            microphone_id: device || null,
            system_audio: system,
            options,
          }),
        );
      } else {
        const result = await api.import(files, options);
        result.errors.forEach((e) => toast.error(e));
        if (!result.documents.length) return;
      }
      setCreate(null);
      setPage("library");
      setFiles([]);
      await refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setWorking(false);
    }
  };
  const control = async (operation: string) => {
    setWorking(true);
    try {
      setRecording(await api.control(operation));
      await refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setWorking(false);
    }
  };
  const openDocument = async (id: string) => {
    try {
      setSelected(await api.get(id));
      setCreate(null);
    } catch (e) {
      toast.error(String(e));
    }
  };
  const active = jobs;
  const renderRows = (items: Document[]) => (
    <div className="ws-document-list">
      {items.map((doc) => (
        <div className="ws-document-row" key={doc.id}>
          <button
            className="ws-document-main"
            onClick={() => void openDocument(doc.id)}
          >
            <span className={`ws-source-icon ${doc.source}`} aria-hidden="true">
              {doc.source === "meeting" ? (
                <Headphones size={19} />
              ) : doc.source === "file" ? (
                <Upload size={18} />
              ) : (
                <Mic size={19} />
              )}
            </span>
            <span className="ws-document-title">
              <strong>{doc.title}</strong>
              <span>
                {t(`workspace.source.${doc.source}`)} ·{" "}
                {new Date(doc.created_at * 1000).toLocaleDateString()}{" "}
                {doc.duration > 0 && `· ${duration(doc.duration)}`}
              </span>
            </span>
            <span className={`ws-status ${doc.stage}`}>
              <span />
              {t(`workspace.stage.${doc.stage}`)}
            </span>
            <ArrowUpRight size={16} className="ws-row-arrow" />
          </button>
          {busy(doc.stage) && !["recording", "paused"].includes(doc.stage) && (
            <button
              className="ws-icon-button"
              aria-label={t("workspace.cancelJob", { title: doc.title })}
              onClick={async () => {
                try {
                  await api.cancel(doc.id);
                  await refresh();
                } catch (e) {
                  toast.error(String(e));
                }
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
  const modelOptions = (
    <div className="ws-form-grid">
      <WsSelect
        label={t("workspace.transcriptionModel")}
        value={options.model}
        onChange={(model) => setOptions({ ...options, model })}
        options={[
          { value: "qwen3-asr", label: "Qwen3 ASR · 1.7B" },
          { value: "large", label: "Whisper large-v3" },
          { value: "turbo", label: "Whisper large-v3-turbo" },
          { value: "parakeet-tdt-0.6b-v3", label: "Parakeet TDT v3" },
          { value: "native", label: t("workspace.currentDictationModel") },
        ]}
      />
      <WsSelect
        label={t("workspace.language")}
        value={options.language}
        onChange={(language) => setOptions({ ...options, language })}
        options={TRANSCRIPTION_LANGUAGES.map((value) => ({
          value,
          label: value === "auto" ? t("workspace.autoLanguage") : value,
        }))}
      />
      <WsToggle
        checked={options.speakers}
        onChange={(speakers) => setOptions({ ...options, speakers })}
        label={t("workspace.detectSpeakers")}
        hint="pyannote Community-1"
      />
      <WsSelect
        label={t("workspace.localNotes")}
        value={options.notes_model ?? ""}
        onChange={(value) =>
          setOptions({ ...options, notes_model: value || null })
        }
        options={[
          { value: "", label: t("workspace.noAutomaticNotes") },
          { value: "qwen3.5-9b", label: "Qwen3.5 · 9B" },
          { value: "qwen3.6-27b", label: "Qwen3.6 · 27B" },
        ]}
      />
    </div>
  );
  return (
    <div className="ws-shell">
      <a className="ws-skip" href="#main-content">
        {t("workspace.skipToContent")}
      </a>
      <aside className="ws-sidebar">
        <div className="ws-brand">
          <SilkScribeWordmark height={30} />
        </div>
        <div className="ws-create-actions">
          <button
            className="ws-primary"
            disabled={!!recording?.document_id}
            onClick={() => void beginMeeting()}
          >
            <Mic size={17} />
            {t("workspace.recordMeeting")}
          </button>
          <button className="ws-secondary" onClick={() => void chooseFiles()}>
            <Upload size={16} />
            {t("workspace.importAudio")}
          </button>
        </div>
        <nav aria-label={t("workspace.navigation")}>
          {[
            { id: "home", icon: Home },
            { id: "library", icon: Library },
          ].map(({ id, icon: Icon }) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "is-active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {t(`workspace.${id}`)}
            </button>
          ))}
        </nav>
        <div className="ws-sidebar-bottom">
          {active.length > 0 && (
            <button
              className="ws-text-button"
              onClick={() => navigate("library")}
            >
              {t("workspace.activeCount", { count: active.length })}
            </button>
          )}
          <p>
            <ShieldCheck size={15} />
            {t("workspace.localOnly")}
          </p>
          <nav>
            <button
              aria-current={page === "settings" ? "page" : undefined}
              className={page === "settings" ? "is-active" : ""}
              onClick={() => navigate("settings")}
            >
              <Settings size={18} />
              {t("workspace.settings")}
            </button>
          </nav>
        </div>
      </aside>
      <main className="ws-main" id="main-content" tabIndex={-1}>
        {recording?.document_id && (
          <div className="ws-recording-bar" role="status">
            <span className="ws-record-dot" />
            <strong>
              {t(
                recording.paused
                  ? "workspace.stage.paused"
                  : "workspace.stage.recording",
              )}
            </strong>
            <span className="ws-time">{duration(recording.seconds)}</span>
            <WsMeter
              label={t("workspace.microphoneLevel")}
              value={recording.microphone_level}
            />
            <WsMeter
              label={t("workspace.systemLevel")}
              value={recording.system_level}
            />
            <button
              disabled={working}
              className="ws-icon-button"
              aria-label={t(
                recording.paused ? "workspace.resume" : "workspace.pause",
              )}
              onClick={() =>
                void control(recording.paused ? "resume" : "pause")
              }
            >
              {recording.paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button
              disabled={working}
              className="ws-secondary"
              onClick={() => void control("stop")}
            >
              <Square size={14} />
              {t("workspace.stopTranscribe")}
            </button>
            {recording.error && <p role="alert">{recording.error}</p>}
          </div>
        )}
        <div className="ws-content">
          {selected ? (
            <Transcript
              key={`${selected.id}-${busy(selected.stage) ? selected.stage : "editable"}`}
              document={selected}
              onBack={() => {
                setSelected(null);
                void refresh();
              }}
              onUpdated={() => void refresh()}
            />
          ) : create ? (
            <section className="ws-creation">
              <button
                className="ws-text-button"
                onClick={() => setCreate(null)}
              >
                <ArrowLeft size={16} />
                {t("workspace.back")}
              </button>
              <p className="ws-eyebrow">{t("workspace.newTranscript")}</p>
              <h1>
                {t(
                  create === "meeting"
                    ? "workspace.recordMeeting"
                    : "workspace.importAudio",
                )}
              </h1>
              <p className="ws-description">
                {t(
                  create === "meeting"
                    ? "workspace.meetingHelp"
                    : "workspace.importHelp",
                )}
              </p>
              {create === "meeting" ? (
                <div className="ws-form-grid">
                  <label>
                    {t("workspace.title")}
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("workspace.meetingTitle")}
                    />
                  </label>
                  <WsSelect
                    label={t("workspace.microphone")}
                    value={device}
                    onChange={setDevice}
                    options={[
                      { value: "", label: t("workspace.defaultMicrophone") },
                      ...devices.map((d) => ({ value: d.id, label: d.name })),
                    ]}
                  />
                  <WsToggle
                    checked={system}
                    onChange={setSystem}
                    label={t("workspace.computerAudio")}
                    hint={t("workspace.systemPermission")}
                  />
                </div>
              ) : (
                <div className="ws-file-selection">
                  {files.map((file, i) => (
                    <div key={`${file}-${i}`}>
                      <Upload size={16} />
                      <span>{file.split(/[\\/]/).pop()}</span>
                      <button
                        className="ws-icon-button"
                        aria-label={t("workspace.removeFile")}
                        onClick={() =>
                          setFiles(files.filter((_, index) => index !== i))
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="ws-text-button"
                    onClick={() => void chooseFiles()}
                  >
                    {t("workspace.chooseFiles")}
                  </button>
                </div>
              )}
              <h2>{t("workspace.processing")}</h2>
              {modelOptions}
              {(!runtime ||
                packs.some(
                  (p) =>
                    [
                      "qwen3-asr",
                      "qwen3-aligner",
                      ...(options.speakers ? ["community-1"] : []),
                      ...(options.notes_model ? [options.notes_model] : []),
                    ].includes(p.id) && !p.installed,
                )) && (
                <div className="ws-alert">
                  <p>{t("workspace.setupNeeded")}</p>
                  <button
                    onClick={() => {
                      setPage("settings");
                      setSettingsPage("local");
                      setCreate(null);
                    }}
                  >
                    {t("workspace.modelSetup")}
                  </button>
                </div>
              )}
              <button
                className="ws-primary"
                disabled={working || (create === "import" && !files.length)}
                onClick={() => void submit()}
              >
                {working
                  ? t("workspace.working")
                  : t(
                      create === "meeting"
                        ? "workspace.startRecording"
                        : "workspace.startTranscription",
                    )}
                <ArrowUpRight size={17} />
              </button>
            </section>
          ) : page === "settings" ? (
            <section>
              <p className="ws-eyebrow">{t("workspace.yourWorkspace")}</p>
              <h1>{t("workspace.settings")}</h1>
              <div className="ws-settings-tabs">
                {(
                  [
                    { id: "general", key: "dictation" },
                    { id: "audio", key: "audio" },
                    { id: "models", key: "modelsLanguage" },
                    { id: "local", key: "localNotes" },
                    { id: "appearance", key: "appearance" },
                    { id: "history", key: "storage" },
                    { id: "advanced", key: "preferences" },
                    ...(settings?.post_process_enabled
                      ? [
                          {
                            id: "postprocessing" as const,
                            key: "dictationProcessing",
                          },
                        ]
                      : []),
                    ...(settings?.debug_mode
                      ? [{ id: "debug" as const, key: "debug" }]
                      : []),
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    className={settingsPage === item.id ? "is-active" : ""}
                    onClick={() => setSettingsPage(item.id)}
                  >
                    {t(`workspace.${item.key}`)}
                  </button>
                ))}
              </div>
              {settingsPage === "local" ? (
                <div className="ws-models">
                  <h2>{t("workspace.localIntelligence")}</h2>
                  <p className="ws-description">
                    {t("workspace.localModelsHelp")}
                  </p>
                  <p className={`ws-alert ${runtime ? "ready" : ""}`}>
                    {t(
                      runtime
                        ? "workspace.runtimeReady"
                        : "workspace.runtimeMissing",
                    )}
                  </p>
                  {packs.map((pack) => (
                    <div className="ws-pack" key={pack.id}>
                      <span className="ws-source-icon">
                        <Cpu size={21} />
                      </span>
                      <div>
                        <h3>{pack.name}</h3>
                        <p>
                          {t(`workspace.purpose.${pack.purpose}`)} ·{" "}
                          {pack.artifacts.length
                            ? `${(pack.artifacts.reduce((n, a) => n + a.bytes, 0) / 1e9).toFixed(1)} GB`
                            : t("workspace.unpublished")}{" "}
                          · {pack.license}
                        </p>
                        <p>
                          {t("workspace.memoryGuidance", {
                            gb: pack.minimum_memory_gb,
                          })}
                        </p>
                        {download?.id === pack.id && (
                          <WsMeter
                            variant="progress"
                            label={t("workspace.downloading")}
                            value={
                              download.total
                                ? download.downloaded / download.total
                                : 0
                            }
                          />
                        )}
                      </div>
                      <button
                        className="ws-secondary"
                        disabled={
                          pack.installed || !!download || !pack.artifacts.length
                        }
                        onClick={async () => {
                          setDownload({ id: pack.id, downloaded: 0, total: 1 });
                          try {
                            await api.install(pack.id);
                            await loadPacks();
                          } catch (e) {
                            toast.error(String(e));
                          } finally {
                            setDownload(null);
                          }
                        }}
                      >
                        {pack.installed ? (
                          <>
                            <Check size={15} />
                            {t("workspace.installed")}
                          </>
                        ) : (
                          t("workspace.download")
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : ["general", "audio", "appearance", "history"].includes(
                  settingsPage,
                ) ? (
                <Preferences
                  page={
                    settingsPage as
                      | "general"
                      | "audio"
                      | "appearance"
                      | "history"
                  }
                />
              ) : (
                renderSettings(settingsPage as SidebarSection, setSettingsPage)
              )}
            </section>
          ) : (
            <>
              <header className="ws-page-header">
                <div>
                  <p className="ws-eyebrow">
                    {t(
                      page === "home"
                        ? "workspace.yourWorkspace"
                        : "workspace.allYourWords",
                    )}
                  </p>
                  <h1>
                    {t(
                      page === "home"
                        ? "workspace.homeTitle"
                        : "workspace.library",
                    )}
                  </h1>
                  <p className="ws-description">
                    {t(
                      page === "home"
                        ? "workspace.homeDescription"
                        : "workspace.libraryDescription",
                    )}
                  </p>
                </div>
                <span className="ws-local-badge">
                  <ShieldCheck size={15} />
                  {t("workspace.onDevice")}
                </span>
              </header>
              {page === "home" && (
                <>
                  <div className="ws-home-actions">
                    <button
                      onClick={() => void beginMeeting()}
                      disabled={!!recording?.document_id}
                    >
                      <Headphones size={24} />
                      <strong>{t("workspace.recordMeeting")}</strong>
                      <span>{t("workspace.meetingShort")}</span>
                      <ArrowUpRight size={18} />
                    </button>
                    <button onClick={() => void chooseFiles()}>
                      <Upload size={24} />
                      <strong>{t("workspace.importAudio")}</strong>
                      <span>{t("workspace.importShort")}</span>
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                  <button
                    className="ws-dictation-strip"
                    onClick={() => {
                      navigate("settings");
                      setSettingsPage("general");
                      onSetupDictation();
                    }}
                  >
                    <Mic size={18} />
                    <span>
                      <strong>{t("workspace.dictation")}</strong>{" "}
                      {t("workspace.dictationHelp")}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  {active.length > 0 && (
                    <section className="ws-active-jobs">
                      <h2>{t("workspace.inProgress")}</h2>
                      {renderRows(active)}
                    </section>
                  )}
                </>
              )}
              <div className="ws-section-heading">
                <h2>
                  {t(
                    page === "home"
                      ? "workspace.recent"
                      : "workspace.transcripts",
                  )}
                </h2>
                {page === "home" && (
                  <button
                    className="ws-text-button"
                    onClick={() => navigate("library")}
                  >
                    {t("workspace.viewLibrary")}
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </div>
              {page === "library" && (
                <>
                  <label className="ws-search">
                    <Search size={18} />
                    <input
                      aria-label={t("workspace.searchLibrary")}
                      placeholder={t("workspace.searchLibrary")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="ws-icon-button"
                        aria-label={t("workspace.clearSearch")}
                        onClick={() => setQuery("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </label>
                  <div className="ws-filters">
                    {["all", "dictation", "meeting", "file", "saved"].map(
                      (value) => (
                        <button
                          key={value}
                          aria-pressed={filter === value}
                          className={filter === value ? "is-active" : ""}
                          onClick={() => setFilter(value)}
                        >
                          {t(`workspace.filter.${value}`)}
                        </button>
                      ),
                    )}
                  </div>
                </>
              )}
              {error ? (
                <div role="alert" className="ws-alert">
                  <p>{error}</p>
                  <button onClick={() => void refresh()}>
                    {t("workspace.retry")}
                  </button>
                </div>
              ) : loading ? (
                <div className="ws-loading" role="status">
                  {t("workspace.loading")}
                </div>
              ) : documents.length ? (
                renderRows(
                  page === "home"
                    ? documents.filter((d) => !busy(d.stage)).slice(0, 8)
                    : documents,
                )
              ) : (
                <div className="ws-empty">
                  <Library size={30} />
                  <h2>
                    {t(
                      query || filter !== "all"
                        ? "workspace.noResults"
                        : "workspace.emptyTitle",
                    )}
                  </h2>
                  <p>
                    {t(
                      query || filter !== "all"
                        ? "workspace.trySearch"
                        : "workspace.emptyDescription",
                    )}
                  </p>
                  {!query && filter === "all" && (
                    <button
                      className="ws-secondary"
                      onClick={() => void chooseFiles()}
                    >
                      {t("workspace.importAudio")}
                    </button>
                  )}
                </div>
              )}
              {page === "library" && more && (
                <button
                  className="ws-secondary ws-load-more"
                  onClick={async () => {
                    try {
                      const next = await api.list(
                        query,
                        filter,
                        documents.length,
                      );
                      setDocuments([...documents, ...next]);
                      setMore(next.length === 100);
                    } catch (e) {
                      toast.error(String(e));
                    }
                  }}
                >
                  {t("workspace.loadMore")}
                </button>
              )}
            </>
          )}
        </div>
      </main>
      {dragging && (
        <div className="ws-drop-overlay">
          <Upload size={36} />
          <h2>{t("workspace.dropAudio")}</h2>
          <p>{"WAV · MP3 · M4A · FLAC · OGG"}</p>
        </div>
      )}
    </div>
  );
}
