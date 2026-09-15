import { AdvancedSettings } from "../settings/advanced/AdvancedSettings";
import { applyProgress, type ProgressEvent } from "./progress";
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
  type DocumentSummary,
  type JobOptions,
  type RecordingStatus,
  type CaptureDevice,
  type ModelPack,
} from "./api";
import { Transcript } from "./Transcript";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Preferences } from "./Preferences";
import { WsMeter, WsSelect, WsToggle } from "./controls";
import { LANGUAGES } from "@/lib/constants/languages";
import { useSettings } from "@/hooks/useSettings";
import { readSetup, writeSetup, readWorkflowOptions } from "./setupStorage";
import "./workspace.css";

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
  const [dictationReady, setDictationReady] = useState(false);
  useEffect(() => {
    let current = true;
    const check = () => {
      if (!settings?.selected_model) {
        setDictationReady(false);
        return;
      }
      void api
        .dictationReady(settings.selected_model)
        .then((ready) => {
          if (current) setDictationReady(ready);
        })
        .catch(() => {
          if (current) setDictationReady(false);
        });
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      current = false;
      window.removeEventListener("focus", check);
    };
  }, [settings?.selected_model]);
  const [page, setPage] = useState("home");
  const [settingsPage, setSettingsPage] = useState<
    SidebarSection | "local" | "audio" | "appearance"
  >("general");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [attention, setAttention] = useState<DocumentSummary[]>([]);
  const [jobs, setJobs] = useState<DocumentSummary[]>([]);
  const [importBatches, setImportBatches] = useState<
    import("@/bindings").ImportBatch[]
  >([]);
  const saveBarrier = useRef<(() => Promise<boolean>) | null>(null);
  const [selected, setSelected] = useState<Document | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [create, setCreate] = useState<"meeting" | "import" | null>(null);
  const [files, setFiles] = useState<string[]>(() => {
    const saved = readSetup<unknown>("pending-files", []);
    return Array.isArray(saved)
      ? saved.filter((p): p is string => typeof p === "string").slice(0, 500)
      : [];
  });
  const importRequest = useRef<string>(
    readSetup("import-request", "") || crypto.randomUUID(),
  );
  useEffect(() => {
    writeSetup("import-request", importRequest.current);
  }, []);
  const [inspections, setInspections] = useState<
    import("@/bindings").FileInspection[]
  >([]);
  const [inspecting, setInspecting] = useState(false);
  const [inspectionError, setInspectionError] = useState("");
  const [importProgress, setImportProgress] = useState<{
    name: string;
    copied: number;
    total: number;
  } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    if (!files.length) {
      setInspections([]);
      setInspecting(false);
      return;
    }
    setInspecting(true);
    setInspectionError("");
    void api
      .inspectFiles(files)
      .then((result) => {
        if (current) setInspections(result);
      })
      .catch((error) => {
        if (current) setInspectionError(String(error));
      })
      .finally(() => {
        if (current) setInspecting(false);
      });
    return () => {
      current = false;
    };
  }, [files]);
  const [returnToSetup, setReturnToSetup] = useState<
    "meeting" | "import" | null
  >(null);
  const [workflowOptions, setWorkflowOptions] = useState(readWorkflowOptions);
  const workflow = create ?? returnToSetup ?? "import";
  const options = workflowOptions[workflow];
  const setOptions = (next: JobOptions) =>
    setWorkflowOptions((previous) => ({ ...previous, [workflow]: next }));
  useEffect(() => {
    writeSetup("workflow-options", workflowOptions);
  }, [workflowOptions]);
  const [title, setTitle] = useState(() => readSetup("meeting-title", ""));
  const [device, setDevice] = useState(() => readSetup("meeting-device", ""));
  const [system, setSystem] = useState(() => readSetup("meeting-system", true));
  useEffect(() => {
    writeSetup("pending-files", files);
  }, [files]);
  useEffect(() => {
    writeSetup("meeting-title", title);
  }, [title]);
  useEffect(() => {
    writeSetup("meeting-device", device);
  }, [device]);
  useEffect(() => {
    writeSetup("meeting-system", system);
  }, [system]);
  const [devices, setDevices] = useState<CaptureDevice[]>([]);
  const [captureReadiness, setCaptureReadiness] = useState<{
    supported: boolean;
    microphone: boolean;
    system: boolean;
  } | null>(null);
  const [captureCheckError, setCaptureCheckError] = useState("");
  useEffect(() => {
    if (create !== "meeting") return;
    let current = true;
    setCaptureReadiness(null);
    const check = async () => {
      try {
        const readiness = await api.captureReadiness(system);
        const audioDevices = readiness.supported ? await api.devices() : [];
        if (current) {
          setCaptureReadiness(readiness);
          setDevices(audioDevices);
          setCaptureCheckError("");
        }
      } catch (error) {
        if (current) setCaptureCheckError(String(error));
      }
    };
    void check();
    window.addEventListener("focus", check);
    return () => {
      current = false;
      window.removeEventListener("focus", check);
    };
  }, [create, system]);
  const [recording, setRecording] = useState<RecordingStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [captureOperation, setCaptureOperation] = useState<string | null>(null);
  const [packs, setPacks] = useState<ModelPack[]>([]);
  const [runtime, setRuntime] = useState<boolean | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  useEffect(() => {
    if (page !== "settings" || !["models", "local"].includes(settingsPage))
      return;
    let current = true;
    setRuntime(null);
    setRuntimeError("");
    void api
      .runtime()
      .then((ready) => {
        if (current) setRuntime(ready);
      })
      .catch((error) => {
        if (current) setRuntimeError(String(error));
      });
    return () => {
      current = false;
    };
  }, [page, settingsPage]);
  const [assessment, setAssessment] = useState<
    import("@/bindings").WorkflowAssessment | null
  >(null);
  const [activity, setActivity] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verification, setVerification] = useState<Record<string, boolean>>({});
  const [removePack, setRemovePack] = useState<string | null>(null);
  const [storage, setStorage] = useState<
    import("@/bindings").WorkspaceStorage | null
  >(null);
  useEffect(() => {
    if (page === "settings")
      void api
        .storage()
        .then(setStorage)
        .catch(() => {});
  }, [page, settingsPage, packs]);
  useEffect(() => {
    let current = true;
    setAssessment(null);
    void api
      .assess(options)
      .then((result) => {
        if (current) setAssessment(result);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [options, packs]);
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
      const [items, activeJobs, batches, needsAttention] = await Promise.all([
        api.list(query, filter),
        api.list("", "jobs"),
        api.importBatches(),
        api.list("", "attention"),
      ]);
      if (ticket !== request.current) return;
      setDocuments(items);
      setJobs(activeJobs);
      setAttention(needsAttention);
      setImportBatches(batches);
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
      setPacks(await api.packs());
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
      const importOff = await listen<{
        name: string;
        copied: number;
        total: number;
      }>("workspace-import-progress", (event) =>
        setImportProgress(event.payload),
      );
      if (disposed) importOff();
      else cleanups.push(importOff);
      const progressOff = await listen<ProgressEvent>(
        "workspace-progress",
        (event) => {
          const update = (items: DocumentSummary[]) =>
            applyProgress(items, event.payload);
          setDocuments(update);
          setJobs(update);
        },
      );
      if (disposed) progressOff();
      else cleanups.push(progressOff);
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
        .onDragDropEvent(async (event) => {
          if (event.payload.type === "over" || event.payload.type === "enter")
            setDragging(true);
          if (event.payload.type === "leave") setDragging(false);
          if (event.payload.type === "drop") {
            setDragging(false);
            const paths = event.payload.paths;
            if (saveBarrier.current && !(await saveBarrier.current())) return;
            setFiles((previous) => [...new Set([...previous, ...paths])]);
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
  const navigate = async (next: string) => {
    if (saveBarrier.current && !(await saveBarrier.current())) return;
    setPage(next);
    setSelected(null);
    setCreate(null);
    setQuery("");
    setFilter("all");
    requestAnimationFrame(() =>
      document.getElementById("main-content")?.focus(),
    );
  };
  const chooseFiles = async () => {
    if (saveBarrier.current && !(await saveBarrier.current())) return;
    if (files.length && create !== "import") {
      setCreate("import");
      setSelected(null);
      return;
    }
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
        setFiles((previous) => [
          ...new Set([
            ...previous,
            ...(Array.isArray(result) ? result : [result]),
          ]),
        ]);
        setCreate("import");
        setSelected(null);
      }
    } catch (e) {
      toast.error(String(e));
    }
  };
  const beginMeeting = async () => {
    if (saveBarrier.current && !(await saveBarrier.current())) return;
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
        setTitle("");
      } else {
        setImportProgress({
          name: files[0]?.split(/[\\/]/).pop() ?? "",
          copied: 0,
          total: 1,
        });
        // Persist before IPC so a process exit cannot lose the retry identity.
        writeSetup("import-request", importRequest.current);
        const result = await api.import(files, options, importRequest.current);
        setImportErrors(result.errors);
        setFiles(result.remaining_paths);
        writeSetup("pending-files", result.remaining_paths);
        if (!result.remaining_paths.length) {
          importRequest.current = crypto.randomUUID();
          writeSetup("import-request", importRequest.current);
        }
        if (!result.documents.length) return;
      }
      setCreate(null);
      setPage("library");
      await refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setWorking(false);
      setImportProgress(null);
    }
  };
  const control = async (operation: string) => {
    setWorking(true);
    setCaptureOperation(operation);
    try {
      setRecording(await api.control(operation));
      await refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setWorking(false);
      setCaptureOperation(null);
    }
  };
  const openDocument = async (id: string) => {
    if (saveBarrier.current && !(await saveBarrier.current())) return;
    try {
      setSelected(await api.get(id));
      setCreate(null);
    } catch (e) {
      toast.error(String(e));
    }
  };
  const active = jobs;
  const renderRows = (items: DocumentSummary[]) => (
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
                {doc.speaker_count > 0 &&
                  ` · ${t("workspace.speakerCount", { count: doc.speaker_count })}`}
                {doc.notes_available && ` · ${t("workspace.notes")}`}
              </span>
            </span>
            <span className={`ws-status ${doc.stage}`}>
              <span />
              {doc.segment_count > 0 &&
              ((doc.stage_errors ?? []).length > 0 || doc.stage === "failed")
                ? t("workspace.transcriptReadyWarning")
                : t(`workspace.stage.${doc.stage}`)}
              {["transcribing", "notes"].includes(doc.stage) && (
                <span>{Math.round(doc.progress * 100)}%</span>
              )}
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
        options={[
          ...new Set([
            "auto",
            options.language,
            ...(assessment?.languages ??
              (options.model === "qwen3-asr"
                ? ["English"]
                : LANGUAGES.filter((l) => l.value !== "auto").map(
                    (l) => l.value,
                  ))),
          ]),
        ].map((value) => ({
          value,
          label:
            value === "auto"
              ? t("workspace.autoLanguage")
              : (LANGUAGES.find((l) => l.value === value)?.label ?? value),
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
              onClick={() => setActivity(true)}
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
      <ConfirmDialog
        open={!!removePack}
        title={t("workspace.removeModel")}
        description={t("workspace.removeModelHelp")}
        confirmLabel={t("workspace.removeModel")}
        cancelLabel={t("workspace.cancel")}
        destructive
        onCancel={() => setRemovePack(null)}
        onConfirm={async () => {
          if (removePack) {
            try {
              await api.removePack(removePack);
              await loadPacks();
            } catch (e) {
              toast.error(String(e));
            }
          }
          setRemovePack(null);
        }}
      />
      <main className="ws-main" id="main-content" tabIndex={-1}>
        {importProgress && (
          <aside className="ws-alert" role="status">
            <strong>
              {t("workspace.importAudio")} · {importProgress.name}
            </strong>
            <WsMeter
              variant="progress"
              label={t("workspace.importAudio")}
              value={
                importProgress.total
                  ? importProgress.copied / importProgress.total
                  : 0
              }
            />
            <button
              onClick={() =>
                void api
                  .cancelImport()
                  .catch((error) => toast.error(String(error)))
              }
            >
              {t("workspace.cancel")}
            </button>
          </aside>
        )}
        {importErrors.length > 0 && (
          <aside className="ws-alert" role="status">
            <h2>{t("workspace.importProblems")}</h2>
            <ul>
              {importErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
            <button onClick={() => setImportErrors([])}>
              {t("workspace.dismiss")}
            </button>
          </aside>
        )}
        {recording?.document_id && (
          <div className="ws-recording-bar" role="status">
            <span className="ws-record-dot" />
            <strong>
              {t(
                captureOperation === "stop" || captureOperation === "save"
                  ? "workspace.finishingAudio"
                  : recording.paused
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
            <button
              className="ws-text-button"
              disabled={working}
              onClick={() => void control("save")}
            >
              {t("workspace.stopSave")}
            </button>
            {recording.error && <p role="alert">{recording.error}</p>}
          </div>
        )}
        <div className="ws-content">
          {!selected &&
            !create &&
            page !== "settings" &&
            importBatches.length > 0 && (
              <section
                className="ws-activity"
                aria-label={t("workspace.unfinishedImports")}
              >
                <h2>{t("workspace.unfinishedImports")}</h2>
                {importBatches.map((batch) => (
                  <div className="ws-import-batch" key={batch.request_id}>
                    <p dir="auto">
                      {batch.paths
                        .map((path) => path.split(/[\\/]/).pop())
                        .join(", ")}
                    </p>
                    {batch.errors.map((error, index) => (
                      <p role="status" key={index}>
                        {error}
                      </p>
                    ))}
                    <button
                      disabled={working}
                      onClick={() => {
                        importRequest.current = batch.request_id;
                        writeSetup("import-request", batch.request_id);
                        setFiles(batch.paths);
                        setWorkflowOptions((previous) => ({
                          ...previous,
                          import: batch.options,
                        }));
                        setCreate("import");
                      }}
                    >
                      {t("workspace.resumeImport")}
                    </button>
                    <button
                      disabled={working}
                      onClick={async () => {
                        try {
                          await api.discardImportBatch(batch.request_id);
                          if (importRequest.current === batch.request_id)
                            setFiles([]);
                          await refresh();
                        } catch (error) {
                          toast.error(String(error));
                        }
                      }}
                    >
                      {t("workspace.discardImport")}
                    </button>
                  </div>
                ))}
              </section>
            )}
          {activity && (
            <section
              className="ws-activity"
              aria-label={t("workspace.activity")}
            >
              <div className="ws-section-heading">
                <h2>{t("workspace.activity")}</h2>
                <button
                  onClick={() => setActivity(false)}
                  aria-label={t("workspace.close")}
                >
                  <X size={18} />
                </button>
              </div>
              {active.length ? (
                renderRows(active)
              ) : (
                <p>{t("workspace.noActiveJobs")}</p>
              )}
            </section>
          )}
          {selected ? (
            <Transcript
              saveBarrier={saveBarrier}
              onSetupModels={() => {
                setPage("settings");
                setSettingsPage("models");
                setSelected(null);
              }}
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
                  <div className="ws-capture-preflight" role="status">
                    {captureCheckError && <p>{captureCheckError}</p>}
                    {captureReadiness && !captureReadiness.supported && (
                      <p>{t("workspace.captureUnsupported")}</p>
                    )}
                    {captureReadiness?.supported && (
                      <>
                        <p>
                          {t(
                            captureReadiness.microphone
                              ? "workspace.microphoneReady"
                              : "workspace.microphonePermissionNeeded",
                          )}
                        </p>
                        {!captureReadiness.microphone && (
                          <button
                            onClick={async () => {
                              try {
                                await api.requestCapturePermission(
                                  "microphone",
                                );
                                setCaptureReadiness(
                                  await api.captureReadiness(system),
                                );
                              } catch (error) {
                                toast.error(String(error));
                              }
                            }}
                          >
                            {t("workspace.allowMicrophone")}
                          </button>
                        )}
                        {system && (
                          <p>
                            {t(
                              captureReadiness.system
                                ? "workspace.computerAudioReady"
                                : "workspace.computerPermissionNeeded",
                            )}
                          </p>
                        )}
                        {system && !captureReadiness.system && (
                          <button
                            onClick={async () => {
                              try {
                                await api.requestCapturePermission("system");
                                setCaptureReadiness(
                                  await api.captureReadiness(system),
                                );
                              } catch (error) {
                                toast.error(String(error));
                              }
                            }}
                          >
                            {t("workspace.allowComputerAudio")}
                          </button>
                        )}
                      </>
                    )}
                    {device && !devices.some((item) => item.id === device) && (
                      <p>{t("workspace.microphoneUnavailable")}</p>
                    )}
                  </div>
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
                  {inspecting && (
                    <p role="status">{t("workspace.checkingFiles")}</p>
                  )}
                  {inspectionError && <p role="alert">{inspectionError}</p>}
                  {files.map((file, i) => (
                    <div key={`${file}-${i}`}>
                      <Upload size={16} />
                      <span>
                        {file.split(/[\\/]/).pop()}
                        {inspections.find((item) => item.path === file) && (
                          <small className="ws-file-detail">
                            {(() => {
                              const item = inspections.find(
                                (item) => item.path === file,
                              )!;
                              return (
                                item.error ||
                                `${(item.bytes / 1024 ** 2).toFixed(1)} MB · ${item.duration === null ? t("workspace.durationUnknown") : duration(item.duration)}`
                              );
                            })()}
                          </small>
                        )}
                      </span>
                      <button
                        className="ws-icon-button"
                        aria-label={t("workspace.removeFile")}
                        disabled={working}
                        onClick={async () => {
                          try {
                            await api.discardPartialImport(file);
                            setFiles((current) =>
                              current.filter((path) => path !== file),
                            );
                          } catch (error) {
                            toast.error(String(error));
                          }
                        }}
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
              <div className="ws-presets">
                <button
                  className="ws-secondary"
                  onClick={() =>
                    setOptions({
                      ...options,
                      model: "native",
                      speakers: false,
                      notes_model: null,
                    })
                  }
                >
                  {t("workspace.presetFast")}
                </button>
                <button
                  className="ws-secondary"
                  onClick={() =>
                    setOptions({
                      ...options,
                      model: "qwen3-asr",
                      speakers: false,
                      notes_model: null,
                    })
                  }
                >
                  {t("workspace.presetDetailed")}
                </button>
                <button
                  className="ws-secondary"
                  onClick={() =>
                    setOptions({
                      ...options,
                      model: "qwen3-asr",
                      notes_model: "qwen3.5-9b",
                    })
                  }
                >
                  {t("workspace.presetNotes")}
                </button>
              </div>
              <details className="ws-processing-details" open>
                <summary>{t("workspace.processingDetails")}</summary>
                {modelOptions}
              </details>
              {assessment && (
                <p className="ws-capability-note">
                  {t(`workspace.timing.${assessment.timing}`, {
                    model: assessment.transcription_model,
                  })}
                </p>
              )}
              {assessment && options.notes_model && (
                <p className="ws-capability-note">
                  {t("workspace.memoryAvailable", {
                    gb: (assessment.available_memory_bytes / 1024 ** 3).toFixed(
                      1,
                    ),
                  })}{" "}
                  {assessment.notes_observation
                    ? t("workspace.memoryObserved", {
                        gb: (
                          assessment.notes_observation.peak_bytes /
                          1024 ** 3
                        ).toFixed(1),
                        count: assessment.notes_observation.samples,
                      })
                    : t("workspace.memoryUnmeasured")}
                </p>
              )}
              {assessment && !assessment.can_process && (
                <div className="ws-alert" role="status">
                  <p>{t("workspace.setupNeeded")}</p>
                  <ul>
                    {assessment.issues.map((issue, i) => (
                      <li key={i}>
                        {t(`workspace.readiness.${issue.code}`, {
                          model: issue.model,
                        })}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      setReturnToSetup(create);
                      setPage("settings");
                      setSettingsPage("models");
                      setCreate(null);
                    }}
                  >
                    {t("workspace.modelSetup")}
                  </button>
                  {(options.speakers || options.notes_model) && (
                    <button
                      onClick={() =>
                        setOptions({
                          ...options,
                          speakers: false,
                          notes_model: null,
                        })
                      }
                    >
                      {t("workspace.withoutEnhancements")}
                    </button>
                  )}
                </div>
              )}
              <button
                className="ws-primary"
                disabled={
                  working ||
                  (create === "meeting" &&
                    (!captureReadiness?.supported ||
                      !captureReadiness.microphone ||
                      (system && !captureReadiness.system) ||
                      !devices.length ||
                      (!!device &&
                        !devices.some((item) => item.id === device)))) ||
                  (create === "import" &&
                    (!files.length ||
                      inspecting ||
                      !!inspectionError ||
                      inspections.some((item) => !!item.error) ||
                      !assessment?.can_process))
                }
                onClick={() => void submit()}
              >
                {working
                  ? t("workspace.working")
                  : t(
                      create === "meeting"
                        ? assessment?.can_process
                          ? "workspace.startRecording"
                          : "workspace.recordForLater"
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
              {returnToSetup && (
                <button
                  className="ws-secondary"
                  onClick={() => {
                    setCreate(returnToSetup);
                    setReturnToSetup(null);
                    void loadPacks();
                  }}
                >
                  <ArrowLeft size={16} />
                  {t("workspace.returnToSetup")}
                </button>
              )}
              {settingsPage === "local" || settingsPage === "models" ? (
                <div className="ws-models">
                  <h2>{t("workspace.localIntelligence")}</h2>
                  <p className="ws-description">
                    {t("workspace.localModelsHelp")}
                  </p>
                  <p className={`ws-alert ${runtime ? "ready" : ""}`}>
                    {runtimeError ||
                      t(
                        runtime === null
                          ? "common.loading"
                          : runtime
                            ? "workspace.runtimeReady"
                            : "workspace.runtimeMissing",
                      )}
                  </p>
                  {packs
                    .filter(
                      (pack) =>
                        settingsPage === "models" || pack.purpose === "notes",
                    )
                    .map((pack) => (
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
                            (pack.installed &&
                              verification[pack.id] !== false) ||
                            !!download ||
                            !!verifying ||
                            !pack.artifacts.length
                          }
                          onClick={async () => {
                            setDownload({
                              id: pack.id,
                              downloaded: 0,
                              total: 1,
                            });
                            try {
                              await api.install(pack.id);
                              setVerification((current) => ({
                                ...current,
                                [pack.id]: true,
                              }));
                              await loadPacks();
                            } catch (e) {
                              toast.error(String(e));
                            } finally {
                              setDownload(null);
                            }
                          }}
                        >
                          {pack.installed && verification[pack.id] !== false ? (
                            <>
                              <Check size={15} />
                              {t("workspace.installed")}
                            </>
                          ) : (
                            t(
                              verification[pack.id] === false
                                ? "modelSelector.retryDownload"
                                : "workspace.download",
                            )
                          )}
                        </button>
                        {pack.installed && (
                          <button
                            className="ws-text-button"
                            disabled={!!verifying || !!download}
                            onClick={async () => {
                              setVerifying(pack.id);
                              try {
                                const result = await api.verifyPack(pack.id);
                                setVerification((current) => ({
                                  ...current,
                                  [pack.id]: result.valid,
                                }));
                              } catch (error) {
                                toast.error(String(error));
                              } finally {
                                setVerifying(null);
                              }
                            }}
                          >
                            {t(
                              verifying === pack.id
                                ? "workspace.working"
                                : "workspace.verifyModel",
                            )}
                          </button>
                        )}
                        {verification[pack.id] !== undefined && (
                          <span role="status">
                            {t(
                              verification[pack.id]
                                ? "workspace.modelVerified"
                                : "workspace.modelDamaged",
                            )}
                          </span>
                        )}
                        {pack.installed && (
                          <button
                            className="ws-text-button"
                            onClick={() => setRemovePack(pack.id)}
                          >
                            {t("workspace.removeModel")}
                          </button>
                        )}
                        {download?.id === pack.id && (
                          <button
                            className="ws-text-button"
                            onClick={() => void api.cancelDownload()}
                          >
                            {t("workspace.pauseDownload")}
                          </button>
                        )}
                      </div>
                    ))}
                  {settingsPage === "models" && (
                    <AdvancedSettings group="runtime" />
                  )}
                  {settingsPage === "models" && (
                    <details>
                      <summary>
                        {t("workspace.advancedDictationModels")}
                      </summary>
                      {renderSettings("models", setSettingsPage)}
                    </details>
                  )}
                </div>
              ) : ["general", "audio", "appearance", "history"].includes(
                  settingsPage,
                ) ? (
                <>
                  {settingsPage === "history" && storage && (
                    <div className="ws-storage">
                      <h2>{t("workspace.storageUsage")}</h2>
                      {[
                        ["audioStorage", storage.audio_bytes],
                        ["modelStorage", storage.model_bytes],
                        ["freeStorage", storage.free_bytes],
                      ].map(([label, bytes]) => (
                        <p key={label}>
                          {t(`workspace.${label}`)}{" "}
                          <strong>{(Number(bytes) / 1e9).toFixed(1)} GB</strong>
                        </p>
                      ))}
                    </div>
                  )}
                  <Preferences
                    page={
                      settingsPage as
                        | "general"
                        | "audio"
                        | "appearance"
                        | "history"
                    }
                  />
                  {settingsPage === "general" &&
                    settings?.post_process_enabled && (
                      <details>
                        <summary>{t("workspace.dictationProcessing")}</summary>
                        {renderSettings("postprocessing", setSettingsPage)}
                      </details>
                    )}
                  {settingsPage === "history" && settings?.debug_mode && (
                    <details>
                      <summary>{t("workspace.debug")}</summary>
                      {renderSettings("debug", setSettingsPage)}
                    </details>
                  )}
                </>
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
                        ? documents.length
                          ? "workspace.home"
                          : "workspace.homeTitle"
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
                  {documents.length === 0 && (
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
                  )}
                  <button
                    className="ws-dictation-strip"
                    onClick={() => {
                      navigate("settings");
                      setSettingsPage("general");
                      if (!dictationReady) onSetupDictation();
                    }}
                  >
                    <Mic size={18} />
                    <span>
                      <strong>{t("workspace.dictation")}</strong>{" "}
                      {dictationReady ? (
                        <>
                          {t("workspace.stage.complete")} ·{" "}
                          <kbd>
                            {settings?.bindings.transcribe?.current_binding}
                          </kbd>
                        </>
                      ) : (
                        t("workspace.dictationHelp")
                      )}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  {attention.length > 0 && (
                    <section
                      className="ws-active-jobs"
                      aria-label={t("workspace.stage.failed")}
                    >
                      <div className="ws-section-heading">
                        <h2>{t("workspace.stage.failed")}</h2>
                        <button
                          className="ws-text-button"
                          onClick={async () => {
                            await navigate("library");
                            setFilter("attention");
                          }}
                        >
                          {t("workspace.viewLibrary")}
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {renderRows(attention.slice(0, 5))}
                    </section>
                  )}
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
                    {[
                      "all",
                      "dictation",
                      "meeting",
                      "file",
                      "saved",
                      "attention",
                    ].map((value) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        className={filter === value ? "is-active" : ""}
                        onClick={() => setFilter(value)}
                      >
                        {t(
                          value === "attention"
                            ? "workspace.stage.failed"
                            : `workspace.filter.${value}`,
                        )}
                      </button>
                    ))}
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
                    ? documents
                        .filter(
                          (d) =>
                            !busy(d.stage) &&
                            !attention.slice(0, 5).some((a) => a.id === d.id),
                        )
                        .slice(0, 8)
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
                  disabled={loadingMore}
                  onClick={async () => {
                    setLoadingMore(true);
                    const ticket = request.current;
                    try {
                      const next = await api.list(
                        query,
                        filter,
                        documents.length,
                      );
                      if (ticket !== request.current) return;
                      setDocuments((current) => [
                        ...current,
                        ...next.filter(
                          (item) =>
                            !current.some(
                              (existing) => existing.id === item.id,
                            ),
                        ),
                      ]);
                      setMore(next.length === 100);
                    } catch (e) {
                      toast.error(String(e));
                    } finally {
                      setLoadingMore(false);
                    }
                  }}
                >
                  {t(loadingMore ? "workspace.working" : "workspace.loadMore")}
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
