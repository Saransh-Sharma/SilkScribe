import type { JobOptions } from "./api";

const defaults: JobOptions = {
  model: "qwen3-asr",
  language: "auto",
  speakers: false,
  notes_model: null,
};
export function readSetup<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem(`workspace-${key}`) || "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function writeSetup(key: string, value: unknown) {
  try {
    localStorage.setItem(`workspace-${key}`, JSON.stringify(value));
  } catch {
    /* Setup remains usable if browser storage is unavailable. */
  }
}
export function readWorkflowOptions(): Record<
  "meeting" | "import",
  JobOptions
> {
  const legacy = readSetup("options", defaults);
  const stored = readSetup("workflow-options", {
    meeting: legacy,
    import: legacy,
  });
  const validate = (value: JobOptions): JobOptions => ({
    model: typeof value?.model === "string" ? value.model : defaults.model,
    language:
      typeof value?.language === "string" ? value.language : defaults.language,
    speakers: value?.speakers === true,
    notes_model:
      typeof value?.notes_model === "string" ? value.notes_model : null,
  });
  return { meeting: validate(stored.meeting), import: validate(stored.import) };
}
