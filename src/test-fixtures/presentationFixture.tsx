/* eslint-disable i18next/no-literal-string */
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { CheckCircle2, Command, Mic2, ShieldCheck } from "lucide-react";
import translation from "@/i18n/locales/en/translation.json";
import type { HistoryEntry, ModelInfo } from "@/bindings";
import {
  AppPage,
  Button,
  ConfirmDialog,
  Dropdown,
  SettingContainer,
  SettingsGroup,
  ToggleSwitch,
} from "@/components/ui";
import ModelCard, {
  type ModelCardStatus,
} from "@/components/onboarding/ModelCard";
import OnboardingShell from "@/components/onboarding/OnboardingShell";
import { HistoryFeedItem } from "@/components/history/HistoryFeedItem";
import RecordingOverlay, {
  type OverlayState,
} from "@/overlay/RecordingOverlay";
import "@/theme.css";
import "@/App.css";

const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

const params = new URLSearchParams(window.location.search);
const view = params.get("view") ?? "system";
const theme = params.get("theme") === "dark" ? "dark" : "light";
const direction = params.get("dir") === "rtl" ? "rtl" : "ltr";
document.documentElement.dataset.theme = theme;
document.documentElement.dir = direction;

const mockModel: ModelInfo = {
  id: "parakeet-tdt-0.6b-v3",
  name: "Parakeet TDT 0.6B v3",
  description: "Fast, accurate local dictation for everyday writing.",
  filename: "parakeet-v3",
  url: null,
  sha256: null,
  size_mb: 642,
  is_downloaded: true,
  is_downloading: false,
  partial_size: 0,
  is_directory: true,
  engine_type: "Parakeet",
  accuracy_score: 0.91,
  speed_score: 0.87,
  supports_translation: false,
  is_recommended: true,
  supported_languages: ["en", "fr", "de"],
  supports_language_selection: false,
  is_custom: false,
};

const mockHistory: HistoryEntry = {
  id: 42,
  file_name: "2026-07-14-0918.wav",
  timestamp: 1783991880,
  saved: true,
  title: "Project note",
  transcription_text:
    "Please move the design review to Thursday afternoon and include the revised onboarding screenshots.",
  post_processed_text: null,
  post_process_prompt: null,
  post_process_requested: false,
};

const SidebarPreview = () => (
  <aside className="flex w-[240px] shrink-0 flex-col border-e border-ss-border-subtle bg-ss-bg-surface-alt p-4">
    <div className="px-2 pb-5 text-xl font-semibold tracking-[-0.03em] text-ss-text-primary">
      SilkScribe
    </div>
    <nav aria-label="Preview navigation" className="space-y-1">
      {["Home", "General", "Models", "Advanced", "History"].map(
        (label, index) => (
          <button
            key={label}
            type="button"
            aria-current={index === 1 ? "page" : undefined}
            className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--ss-radius-md)] px-3 text-sm font-semibold ${
              index === 1
                ? "bg-ss-brand-secondary/12 text-ss-brand-secondary"
                : "text-ss-text-secondary"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current opacity-70" />
            {label}
          </button>
        ),
      )}
    </nav>
  </aside>
);

const SystemFixture = () => {
  const [feedback, setFeedback] = useState(true);
  return (
    <div className="flex h-[100dvh] bg-ss-bg-canvas text-ss-text-primary">
      <SidebarPreview />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[1060px]">
          <AppPage
            eyebrow="Everyday setup"
            title="Keep SilkScribe ready to record"
            description="Set the shortcut, choose your microphone, and keep the basics feeling automatic."
          >
            <SettingsGroup title="Recording">
              <SettingContainer
                title="Global shortcut"
                description="Press this anywhere to start dictating."
                descriptionMode="inline"
                grouped
              >
                <Button variant="secondary">
                  <Command className="h-4 w-4" />⌘ ⇧ Space
                </Button>
              </SettingContainer>
              <SettingContainer
                title="Microphone"
                description="The input SilkScribe listens to."
                descriptionMode="inline"
                grouped
              >
                <Dropdown
                  selectedValue="studio"
                  options={[
                    { value: "studio", label: "Studio Display Microphone" },
                    { value: "mac", label: "MacBook Pro Microphone" },
                  ]}
                  onSelect={() => undefined}
                />
              </SettingContainer>
            </SettingsGroup>
            <SettingsGroup title="Feedback">
              <ToggleSwitch
                checked={feedback}
                onChange={setFeedback}
                label="Audio feedback"
                description="Play a quiet cue when recording starts and stops."
                descriptionMode="inline"
                grouped
              />
            </SettingsGroup>
          </AppPage>
        </div>
      </main>
    </div>
  );
};

const HomeFixture = () => (
  <div className="min-h-[100dvh] bg-ss-bg-canvas p-6 text-ss-text-primary">
    <section className="mx-auto max-w-[1040px] overflow-hidden rounded-[var(--ss-radius-xl)] border border-ss-border-default bg-ss-bg-surface shadow-[var(--ss-shadow-card)]">
      <div className="flex items-start justify-between gap-5 px-6 py-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ss-text-tertiary">
            Ready to dictate
          </p>
          <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.038em]">
            SilkScribe is ready
          </h1>
          <p className="mt-2 text-sm text-ss-text-secondary">
            Your shortcut, microphone, local model, and permissions are all set.
          </p>
        </div>
        <Button>Review recording setup</Button>
      </div>
      <div className="grid grid-cols-4 border-y border-ss-border-subtle bg-ss-bg-surface-alt/38">
        {[
          [Command, "Shortcut", "⌘ ⇧ Space"],
          [Mic2, "Microphone", "Studio Display"],
          [CheckCircle2, "Model", "Parakeet v3"],
          [ShieldCheck, "Permissions", "Granted"],
        ].map(([Icon, label, value]) => {
          const StatusIcon = Icon as React.ComponentType<{
            className?: string;
          }>;
          return (
            <div
              key={String(label)}
              className="border-s border-ss-border-subtle px-4 py-4 first:border-s-0"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-ss-text-tertiary">
                <StatusIcon className="h-4 w-4 text-ss-brand-primary" />
                {String(label)}
              </div>
              <p className="mt-2 ps-6 text-sm font-semibold">{String(value)}</p>
            </div>
          );
        })}
      </div>
    </section>
  </div>
);

const ModelFixture = () => {
  const requestedState = params.get("state") ?? "active";
  const state = (
    requestedState === "installed" ? "available" : requestedState
  ) as ModelCardStatus;
  return (
    <div className="min-h-[100dvh] bg-ss-bg-canvas p-8 text-ss-text-primary">
      <div className="mx-auto max-w-[900px] space-y-3">
        <AppPage
          title="Local transcription models"
          description="Models stay on this device and can be switched whenever you need."
        >
          <ModelCard
            model={{ ...mockModel, is_downloaded: state !== "downloadable" }}
            status={state}
            onSelect={() => undefined}
            onDownload={() => undefined}
            onDelete={() => undefined}
            onCancel={() => undefined}
            downloadProgress={47.2}
            downloadSpeed={18.4}
            downloadBytes={{ downloaded: 318_000_000, total: 672_000_000 }}
          />
        </AppPage>
      </div>
    </div>
  );
};

const HistoryFixture = () => (
  <div className="min-h-[100dvh] bg-ss-bg-canvas p-8 text-ss-text-primary">
    <div
      data-testid="history-row"
      className="mx-auto max-w-[960px] overflow-hidden rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface shadow-[var(--ss-shadow-card)]"
    >
      <HistoryFeedItem
        entry={mockHistory}
        onToggleSaved={() => undefined}
        onCopyText={() => undefined}
        onDelete={() => undefined}
        onRetryTranscription={() => undefined}
        getAudioUrl={async () => null}
      />
    </div>
  </div>
);

const OnboardingFixture = () => (
  <OnboardingShell
    stepLabels={["Welcome", "Microphone", "Accessibility", "Setup", "Practice"]}
    activeStep={2}
    eyebrow="Private by design"
    title="One permission keeps dictation effortless"
    description="SilkScribe uses Accessibility only to paste the finished text into the app you are already using."
    footer={
      <div className="flex justify-end">
        <Button>Open System Settings</Button>
      </div>
    }
  >
    <div className="grid h-full grid-cols-[0.9fr_1.1fr] gap-5">
      <div className="p-5 text-sm leading-relaxed text-ss-text-secondary">
        Follow the three short steps, then return here. SilkScribe checks the
        permission automatically.
      </div>
      <div className="rounded-[var(--ss-radius-lg)] bg-ss-bg-surface-alt p-5 shadow-[var(--ss-shadow-hairline)]">
        System Settings preview
      </div>
    </div>
  </OnboardingShell>
);

const DialogFixture = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-ss-bg-canvas">
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <ConfirmDialog
        open={open}
        title="Delete this local model?"
        description="The model can be downloaded again later."
        confirmLabel="Delete model"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
};

const DropdownFixture = () => (
  <div className="flex min-h-[100dvh] items-end justify-end bg-ss-bg-canvas p-5">
    <Dropdown
      selectedValue="native"
      options={[
        { value: "legacy", label: "Legacy shortcut", disabled: true },
        { value: "tauri", label: "Tauri global shortcut" },
        { value: "native", label: "Native Keys" },
      ]}
      onSelect={() => undefined}
    />
  </div>
);

const OverlayFixture = () => {
  const state = (params.get("state") ?? "recording") as OverlayState;
  return (
    <div
      className={`h-[100dvh] ${params.get("backdrop") === "light" ? "bg-[#f5efe7]" : "bg-[#28231f]"}`}
    >
      <RecordingOverlay previewState={state} previewVisible />
    </div>
  );
};

const fixture =
  view === "home" ? (
    <HomeFixture />
  ) : view === "model" ? (
    <ModelFixture />
  ) : view === "history" ? (
    <HistoryFixture />
  ) : view === "onboarding" ? (
    <OnboardingFixture />
  ) : view === "dialog" ? (
    <DialogFixture />
  ) : view === "dropdown" ? (
    <DropdownFixture />
  ) : view === "overlay" ? (
    <OverlayFixture />
  ) : (
    <SystemFixture />
  );

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>{fixture}</I18nextProvider>
  </React.StrictMode>,
);
