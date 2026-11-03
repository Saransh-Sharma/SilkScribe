import { drafts } from "./drafts";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
  checkScreenRecordingPermission,
  requestMicrophonePermission,
  requestScreenRecordingPermission,
} from "tauri-plugin-macos-permissions-api";
import { commands } from "@/bindings";
export type {
  Document,
  DocumentSummary,
  DocumentEdit,
  Segment,
  Speaker,
  Notes,
  JobOptions,
  ModelPack,
  RecordingStatus,
  CaptureDevice,
} from "@/bindings";
export async function unwrap<T>(
  request: Promise<
    { status: "ok"; data: T } | { status: "error"; error: string }
  >,
): Promise<T> {
  const result = await request;
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}
/** Notes templates, as `src-tauri/src/workspace/templates.rs` defines them.
 * Names and section titles are under `workspace.templates`. */
export const NOTE_TEMPLATES = [
  "general",
  "one_on_one",
  "standup",
  "customer_call",
  "interview",
  "lecture",
] as const;
export type NoteTemplate = (typeof NOTE_TEMPLATES)[number];

export const api = {
  captureReadiness: async (systemAudio: boolean) => {
    if (platform() !== "macos")
      return { supported: false, microphone: false, system: false };
    const [microphone, system] = await Promise.all([
      checkMicrophonePermission(),
      systemAudio ? checkScreenRecordingPermission() : Promise.resolve(true),
    ]);
    return { supported: true, microphone, system };
  },
  requestCapturePermission: async (source: "microphone" | "system") => {
    if (source === "microphone") await requestMicrophonePermission();
    else await requestScreenRecordingPermission();
  },
  dictationReady: async (model: string) => {
    const installed =
      (await unwrap(commands.getModelInfo(model)))?.is_downloaded ?? false;
    if (!installed) return false;
    if (platform() === "macos") {
      const permissions = await Promise.all([
        checkAccessibilityPermission(),
        checkMicrophonePermission(),
      ]);
      return permissions.every(Boolean);
    }
    return installed;
  },
  /** Call apps running now, to capture just one of them. */
  callApps: () => commands.workspaceCallApps(),
  /** Answers a question across the Library, citing its passages. */
  ask: (question: string) => unwrap(commands.workspaceAsk(question)),
  cancelAsk: () => commands.workspaceCancelAsk(),
  calendarStatus: () => commands.calendarStatus(),
  connectCalendar: () => unwrap(commands.connectCalendar()),
  disconnectCalendar: () => commands.disconnectCalendar(),
  upcomingMeetings: () => commands.upcomingMeetings(),
  /** The calendar meeting going on now, to name a recording after. */
  currentMeeting: () => commands.currentCalendarMeeting(),
  openCalendarPrivacy: () => unwrap(commands.openCalendarPrivacy()),
  /** Apps dictated into recently, for per-app styles. */
  recentDictationApps: () => unwrap(commands.recentDictationApps()),
  /** Today's dictation, the streak and the latest dictations. */
  dictationSummary: () => unwrap(commands.getDictationSummary()),
  /** Apple Intelligence can clean up dictation on this Mac. */
  onDeviceCleanupAvailable: () => commands.checkAppleIntelligenceAvailable(),
  enableOnDeviceCleanup: () => unwrap(commands.enableOnDeviceCleanup()),
  dismissCleanupSuggestion: () => unwrap(commands.dismissAiCleanupCard()),
  /** Teaches a spelling, or (when `heard` differs) a replacement. */
  addToDictionary: (heard: string | null, write: string) =>
    unwrap(commands.addToDictionary(heard, write)),
  userNotes: (id: string) => unwrap(commands.workspaceUserNotes(id)),
  saveUserNotes: (id: string, body: string) =>
    unwrap(commands.workspaceSaveUserNotes(id, body)),
  /** Writes something from meetings by a recipe; the weekly recap with no
   * ids reads the past week's meetings. */
  runRecipe: (recipe: string, documentIds: string[], instruction?: string) =>
    unwrap(commands.workspaceRunRecipe(recipe, documentIds, instruction ?? null)),
  /** Notes on a meeting that its heads-up message was copied. */
  recordHeadsUp: (id: string) => unwrap(commands.workspaceRecordHeadsUp(id)),
  cancelImport: () => unwrap(commands.workspaceCancelImport()),
  importBatches: () => unwrap(commands.workspaceImportBatches()),
  discardImportBatch: (requestId: string) =>
    unwrap(commands.workspaceDiscardImportBatch(requestId)),
  verifyPack: (id: string) => unwrap(commands.workspaceVerifyPack(id)),
  inspectFiles: (paths: string[]) =>
    unwrap(commands.workspaceInspectFiles(paths)),
  resolveNotes: (
    id: string,
    accept: boolean,
    revision: number,
    section: "summary" | "decisions" | "actions" | null = null,
  ) => unwrap(commands.workspaceResolveNotes(id, accept, revision, section)),
  cancelDownload: () => unwrap(commands.workspaceCancelDownload()),
  removePack: (id: string) => unwrap(commands.workspaceRemovePack(id)),
  storage: () => unwrap(commands.workspaceStorage()),
  configure: (id: string, options: import("@/bindings").JobOptions) =>
    unwrap(commands.workspaceConfigureJob(id, options)),
  assess: (options: import("@/bindings").JobOptions) =>
    unwrap(commands.workspaceAssess(options)),
  playback: (id: string) => unwrap(commands.workspacePlayback(id)),
  exportPreview: (
    id: string,
    format: string,
    content: import("@/bindings").ExportContent,
  ) => unwrap(commands.workspaceExportPreview(id, format, content)),
  list: (query = "", filter = "all", offset = 0) =>
    unwrap(commands.workspaceList(query, filter, offset)),
  get: async (id: string) => {
    await drafts.load(id);
    return unwrap(commands.workspaceGet(id));
  },
  discardPartialImport: (path: string) =>
    unwrap(commands.workspaceDiscardPartialImport(path)),
  import: (
    paths: string[],
    options: import("@/bindings").JobOptions,
    requestId: string,
  ) => unwrap(commands.workspaceImport(paths, options, requestId)),
  edit: (edit: import("@/bindings").DocumentEdit) =>
    drafts.run(edit.id, () => unwrap(commands.workspaceEdit(edit))),
  cancel: (id: string) => unwrap(commands.workspaceCancel(id)),
  retry: (
    id: string,
    notesOnly = false,
    notesModel: string | null = null,
    onlyStage: import("@/bindings").Stage | null = null,
    notesSection: import("@/bindings").NotesSection | null = null,
    notesTemplate: NoteTemplate | null = null,
  ) =>
    unwrap(
      commands.workspaceRetry(
        id,
        notesOnly,
        notesModel,
        onlyStage,
        notesSection,
        notesTemplate,
      ),
    ),
  remove: async (id: string, audioOnly = false) => {
    const result = await drafts.run(id, () =>
      unwrap(commands.workspaceDelete(id, audioOnly)),
    );
    drafts.remove(id);
    return result;
  },
  export: (
    id: string,
    format: string,
    path: string,
    content: import("@/bindings").ExportContent | null = null,
  ) => unwrap(commands.workspaceExport(id, format, path, content)),
  packs: () => unwrap(commands.workspacePacks()),
  install: (id: string) => unwrap(commands.workspaceInstallPack(id)),
  runtime: () => unwrap(commands.workspaceRuntimeReady()),
  status: () => unwrap(commands.workspaceRecordingStatus()),
  start: (options: import("@/bindings").RecordingOptions) =>
    unwrap(commands.workspaceRecordingStart(options)),
  control: (operation: string) =>
    unwrap(commands.workspaceRecordingControl(operation)),
  devices: () => unwrap(commands.workspaceCaptureDevices()),
};
export const duration = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  return value >= 3600
    ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
    : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};
export const busy = (stage: string) =>
  [
    "recording",
    "paused",
    "queued",
    "preparing",
    "transcribing",
    "diarizing",
    "notes",
  ].includes(stage);
