import { commands } from "@/bindings";
export type {
  Document,
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
export const api = {
  list: (query = "", filter = "all", offset = 0) =>
    unwrap(commands.workspaceList(query, filter, offset)),
  get: (id: string) => unwrap(commands.workspaceGet(id)),
  import: (paths: string[], options: import("@/bindings").JobOptions) =>
    unwrap(commands.workspaceImport(paths, options)),
  edit: (edit: import("@/bindings").DocumentEdit) =>
    unwrap(commands.workspaceEdit(edit)),
  cancel: (id: string) => unwrap(commands.workspaceCancel(id)),
  retry: (id: string, notesOnly = false, notesModel: string | null = null) =>
    unwrap(commands.workspaceRetry(id, notesOnly, notesModel)),
  remove: (id: string, audioOnly = false) =>
    unwrap(commands.workspaceDelete(id, audioOnly)),
  export: (id: string, format: string, path: string) =>
    unwrap(commands.workspaceExport(id, format, path)),
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
