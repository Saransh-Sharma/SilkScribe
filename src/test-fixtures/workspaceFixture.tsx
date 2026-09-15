import React from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import arabic from "@/i18n/locales/ar/translation.json";
import translation from "@/i18n/locales/en/translation.json";
import Workspace from "@/components/workspace/Workspace";
import { api, type Document } from "@/components/workspace/api";
import { Toaster } from "sonner";
import { drafts, draftStorage } from "@/components/workspace/drafts";
import "@/theme.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: new URLSearchParams(location.search).get("lang") ?? "en",
  fallbackLng: "en",
  resources: { en: { translation }, ar: { translation: arabic } },
  interpolation: { escapeValue: false },
});
const params = new URLSearchParams(location.search);
Object.assign(window, {
  __TAURI_OS_PLUGIN_INTERNALS__: {
    os_type: "macos",
    platform: "macos",
    arch: "aarch64",
    version: "15.0",
  },
});
document.documentElement.dataset.theme = params.get("theme") ?? "light";
document.documentElement.dir = params.get("dir") ?? "ltr";
let docs: Document[] = [
  {
    id: "one",
    title: "Product design review",
    source: "meeting",
    created_at: 1788900000,
    duration: 1842,
    stage: "complete",
    progress: 1,
    error: null,
    failed_stage: null,
    saved: true,
    audio_path: null,
    segments: [
      {
        id: "s0",
        start: 2,
        end: 8,
        text: "Let’s make the first recording easier to start.",
        original_text: "Let’s make the first recording easier to start.",
        speaker: "p1",
      },
      {
        id: "s1",
        start: 9,
        end: 17,
        text: "I’ll bring the revised screens to our next review on Friday.",
        original_text:
          "I’ll bring the revised screens to our next review on Friday.",
        speaker: "p2",
      },
    ],
    speakers: [
      { id: "p1", name: "Priya" },
      { id: "p2", name: "Sam" },
    ],
    turns: [],
    notes: {
      summary: [
        {
          text: "The team discussed simplifying the first recording.",
          evidence: [],
          sources: ["s0"],
        },
      ],
      decisions: [],
      actions: [
        {
          text: "Bring revised screens to the next review.",
          owner: "Sam",
          due: "Friday",
          evidence: [],
          sources: ["s1"],
          done: false,
        },
      ],
      transcript_revision: 0,
      reviewed: false,
    },
    options: {
      model: "qwen3-asr",
      language: "auto",
      speakers: true,
      notes_model: "qwen3.5-9b",
    },
    attempt_id: "fixture-attempt",
    revision: 0,
    history_id: null,
    diarized: true,
    stage_errors: [],
  },
  {
    id: "two",
    title: "Research interview — Elena",
    source: "file",
    created_at: 1788810000,
    duration: 2167,
    stage: "failed",
    progress: 0,
    error: "Download pyannote Community-1 to identify speakers.",
    failed_stage: "diarizing",
    saved: false,
    audio_path: null,
    segments: [],
    speakers: [],
    turns: [],
    notes: null,
    options: {
      model: "qwen3-asr",
      language: "auto",
      speakers: true,
      notes_model: null,
    },
    attempt_id: "fixture-attempt",
    revision: 0,
    history_id: null,
    diarized: false,
    stage_errors: [],
  },
];
if (params.has("long")) {
  docs[0].duration = 14400;
  docs[0].segments = Array.from({ length: 6000 }, (_, index) => ({
    id: `long-${index}`,
    start: index * 2.4,
    end: (index + 1) * 2.4,
    text: `Turn ${index + 1}: The team reviewed the design and agreed to discuss the next steps.`,
    original_text: `Turn ${index + 1}: The team reviewed the design and agreed to discuss the next steps.`,
    speaker: index % 2 ? "p2" : "p1",
  }));
  docs[0].notes = null;
}
const audioFixture = params.get("audio");
if (
  audioFixture &&
  ["wav", "mp3", "m4a", "flac", "ogg"].includes(audioFixture)
) {
  docs[0].audio_path = `/tests/fixtures/audio/tone.${audioFixture}`;
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { convertFileSrc: (path: string) => path },
  });
}
if (params.has("candidate"))
  docs[0].notes_candidate = {
    summary: [
      { text: "A fresh summary to review.", evidence: [], sources: ["s0"] },
    ],
    decisions: [],
    actions: [],
    transcript_revision: 0,
    reviewed: false,
  };
for (const document of docs) {
  for (const notes of [document.notes, document.notes_candidate]) {
    if (!notes) continue;
    for (const item of [
      ...notes.summary,
      ...notes.decisions,
      ...notes.actions,
    ]) {
      item.evidence = item.sources.map((id) => {
        const segment = document.segments.find((s) => s.id === id)!;
        return {
          segment_id: id,
          text: segment.text,
          start: segment.start,
          end: segment.end,
          transcript_revision: document.revision,
        };
      });
    }
  }
}
if (params.has("empty")) docs = [];
api.list = async (query = "", filter = "all") =>
  structuredClone(
    docs
      .filter(
        (d) =>
          (filter === "all" ||
            filter === d.source ||
            (filter === "saved" && d.saved) ||
            (filter === "attention" &&
              (["failed", "interrupted"].includes(d.stage) ||
                (d.stage === "complete" && !!d.stage_errors?.length)))) &&
          `${d.title} ${d.segments.map((s) => s.text).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .map((d) => ({
        id: d.id,
        attempt_id: d.attempt_id ?? "",
        revision: d.revision,
        title: d.title,
        source: d.source,
        created_at: d.created_at,
        duration: d.duration,
        stage: d.stage,
        progress: d.progress,
        saved: d.saved,
        stage_errors: d.stage_errors ?? [],
        segment_count: d.segments.length,
        speaker_count: d.speakers.length,
        notes_available: !!d.notes,
      })),
  );
draftStorage.get = async (id) =>
  JSON.parse(localStorage.getItem(`fixture-db-draft-${id}`) || "null");
draftStorage.put = async (doc) => {
  localStorage.setItem(`fixture-db-draft-${doc.id}`, JSON.stringify(doc));
  return null;
};
draftStorage.remove = async (id) => {
  localStorage.removeItem(`fixture-db-draft-${id}`);
  return null;
};
api.get = async (id) => {
  await drafts.load(id);
  return structuredClone(docs.find((d) => d.id === id)!);
};
api.edit = async (edit) =>
  drafts.run(edit.id, async () => {
    const d = docs.find((d) => d.id === edit.id)!;
    if (edit.expected_revision !== d.revision) throw Error("Revision conflict");
    if (params.has("delaySave")) await new Promise((r) => setTimeout(r, 800));
    const changed =
      JSON.stringify(d.segments) !== JSON.stringify(edit.segments) ||
      JSON.stringify(d.speakers) !== JSON.stringify(edit.speakers);
    Object.assign(d, edit, { revision: d.revision + 1 });
    if (!changed) {
      if (d.notes?.transcript_revision === edit.expected_revision)
        d.notes.transcript_revision = d.revision;
      if (d.notes_candidate?.transcript_revision === edit.expected_revision)
        d.notes_candidate.transcript_revision = d.revision;
    }
    await draftStorage.remove(d.id);
    return structuredClone(d);
  });
api.resolveNotes = async (id, accept, revision, section = null) => {
  const d = docs.find((d) => d.id === id)!;
  if (revision !== d.revision) throw Error("Revision conflict");
  if (accept) {
    section = d.notes_candidate?.generated_section ?? section;
    if (section && d.notes)
      d.notes = {
        ...d.notes,
        [section]: d.notes_candidate![section],
        reviewed: false,
      };
    else d.notes = d.notes_candidate!;
  }
  d.notes_candidate = null;
  d.revision += 1;
  if (d.notes) d.notes.transcript_revision = d.revision;
  return structuredClone(d);
};
api.remove = async (id, audioOnly) => {
  if (!audioOnly) docs = docs.filter((d) => d.id !== id);
  return null;
};
api.packs = async () => [];
api.runtime = async () => {
  if (new URLSearchParams(location.search).has("runtimeFailure")) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    throw new Error("Speech runtime: dependency check failed");
  }
  return true;
};
api.assess = async () => ({
  can_process: true,
  issues: [],
  languages: ["English", "French", "Japanese"],
  timing: "aligned",
  transcription_model: "qwen3-asr",
  available_memory_bytes: 16000000000,
  notes_observation: null,
});
api.playback = async () => (audioFixture ? docs[0].audio_path : null);
api.storage = async () => ({
  audio_bytes: 0,
  model_bytes: 0,
  free_bytes: 1e10,
});
api.status = async () => ({
  document_id: null,
  paused: false,
  seconds: 0,
  microphone_level: 0,
  system_level: 0,
  error: null,
});
api.inspectFiles = async (paths) =>
  paths.map((path) => ({ path, bytes: 1048576, duration: 90, error: null }));
api.dictationReady = async () => false;
api.devices = async () => [{ id: "default", name: "Studio microphone" }];
api.captureReadiness = async () => ({
  supported: true,
  microphone: !params.has("deniedCapture"),
  system: !params.has("deniedCapture"),
});
api.requestCapturePermission = async () => {};
api.exportPreview = async (id, format, content) => {
  const d = docs.find((d) => d.id === id)!;
  return JSON.stringify(
    {
      format,
      segments: content.transcript
        ? d.segments.map((s) => ({
            ...s,
            text: content.original_text ? s.original_text : s.text,
          }))
        : [],
      notes: content.notes ? d.notes : null,
    },
    null,
    2,
  );
};
api.discardPartialImport = async () => null;
api.importBatches = async () =>
  params.has("unfinishedBatch")
    ? [
        {
          request_id: "persisted-batch",
          paths: ["/fixtures/recovered.wav"],
          options: docs[0].options,
          errors: [],
        },
      ]
    : [];
api.discardImportBatch = async () => null;
api.import = async (paths) => ({
  documents: paths.length > 1 ? [structuredClone(docs[0])] : [],
  errors: ["The remaining file could not be copied."],
  remaining_paths: paths.slice(-1),
});
api.configure = async (id, options) => {
  docs.find((d) => d.id === id)!.options = options;
  return null;
};
api.retry = async (id, notesOnly, notesModel, onlyStage, notesSection) => {
  const d = docs.find((d) => d.id === id)!;
  localStorage.setItem(
    "fixture-retry",
    JSON.stringify({ id, notesOnly, notesModel, onlyStage, notesSection }),
  );
  d.stage = "queued";
  if (params.has("sectionGeneration") && notesSection) {
    const item = {
      text: "New section result",
      sources: ["s0"],
      evidence: d.notes?.summary[0]?.evidence ?? [],
    };
    d.notes_candidate = {
      summary: [],
      decisions: [],
      actions: [],
      transcript_revision: d.revision,
      generated_section: notesSection,
      reviewed: false,
      [notesSection]: [
        notesSection === "actions"
          ? { ...item, owner: null, due: null, done: false }
          : item,
      ],
    };
    d.stage = "complete";
  }
  return null;
};
createRoot(document.getElementById("root")!).render(
  <I18nextProvider i18n={i18n}>
    <Toaster />
    <Workspace renderSettings={() => null} onSetupDictation={() => {}} />
  </I18nextProvider>,
);
