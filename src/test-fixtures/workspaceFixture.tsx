import React from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import translation from "@/i18n/locales/en/translation.json";
import Workspace from "@/components/workspace/Workspace";
import { api, type Document } from "@/components/workspace/api";
import { Toaster } from "sonner";
import "@/theme.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
});
const params = new URLSearchParams(location.search);
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
          sources: ["s0"],
        },
      ],
      decisions: [],
      actions: [
        {
          text: "Bring revised screens to the next review.",
          owner: "Sam",
          due: "Friday",
          sources: ["s1"],
          done: false,
        },
      ],
      transcript_revision: 0,
    },
    options: {
      model: "qwen3-asr",
      language: "auto",
      speakers: true,
      notes_model: "qwen3.5-9b",
    },
    revision: 0,
    history_id: null,
    diarized: true,
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
    revision: 0,
    history_id: null,
    diarized: false,
  },
];
if (params.has("empty")) docs = [];
api.list = async (query = "", filter = "all") =>
  structuredClone(
    docs.filter(
      (d) =>
        (filter === "all" ||
          filter === d.source ||
          (filter === "saved" && d.saved)) &&
        `${d.title} ${d.segments.map((s) => s.text).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
  );
api.get = async (id) => structuredClone(docs.find((d) => d.id === id)!);
api.edit = async (edit) => {
  const d = docs.find((d) => d.id === edit.id)!;
  if (edit.expected_revision !== d.revision) throw Error("Revision conflict");
  Object.assign(d, edit, { revision: d.revision + 1 });
  return structuredClone(d);
};
api.remove = async (id, audioOnly) => {
  if (!audioOnly) docs = docs.filter((d) => d.id !== id);
  return null;
};
api.packs = async () => [];
api.runtime = async () => true;
api.status = async () => ({
  document_id: null,
  paused: false,
  seconds: 0,
  microphone_level: 0,
  system_level: 0,
  error: null,
});
api.devices = async () => [{ id: "default", name: "Studio microphone" }];
api.retry = async (id) => {
  docs.find((d) => d.id === id)!.stage = "queued";
  return null;
};
createRoot(document.getElementById("root")!).render(
  <I18nextProvider i18n={i18n}>
    <Toaster />
    <Workspace renderSettings={() => null} onSetupDictation={() => {}} />
  </I18nextProvider>,
);
