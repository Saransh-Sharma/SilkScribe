import type { DocumentSummary, Stage } from "@/bindings";

export interface ProgressEvent {
  version: number;
  id: string;
  attempt_id: string;
  stage: Stage;
  revision: number;
  progress: number;
}

export function applyProgress(items: DocumentSummary[], event: ProgressEvent) {
  if (
    event.version !== 2 ||
    !event.attempt_id ||
    !Number.isFinite(event.progress) ||
    event.progress < 0 ||
    event.progress > 1
  )
    return items;
  return items.map((doc) =>
    doc.id === event.id &&
    doc.attempt_id === event.attempt_id &&
    doc.stage === event.stage &&
    doc.revision === event.revision &&
    ["transcribing", "diarizing", "notes", "preparing"].includes(doc.stage)
      ? { ...doc, progress: Math.max(doc.progress, event.progress) }
      : doc,
  );
}
