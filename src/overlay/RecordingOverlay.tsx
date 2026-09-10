import { listen } from "@tauri-apps/api/event";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import GpuWaveformStage from "./GpuWaveformStage";
import { WAVEFORM_BUCKET_COUNT } from "./waveformConfig";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

export type OverlayState =
  | "recording"
  | "transcribing"
  | "processing"
  | "success"
  | "error"
  | "cancelled"
  | "empty";

/** Theme preference as sent by Rust. `system` is resolved here, not there. */
export type OverlayThemePreference = "light" | "dark" | "system";

export type ResolvedOverlayTheme = "light" | "dark";

interface OverlayEventPayload {
  state: OverlayState;
  theme?: OverlayThemePreference;
  /** i18n key suffix under `overlay.detail.*`, sent instead of a literal
   *  string because Rust has no access to the user's translation bundle. */
  detailCode?: string;
  /** Excerpt of the text that was actually delivered, shown on success. */
  previewText?: string;
  /** Screen edge the overlay is anchored to, so it can enter from that side. */
  position?: "top" | "bottom";
  canCancel: boolean;
}

const OVERLAY_STATES: readonly OverlayState[] = [
  "recording",
  "transcribing",
  "processing",
  "success",
  "error",
  "cancelled",
  "empty",
];

const isOverlayState = (value: unknown): value is OverlayState =>
  typeof value === "string" && OVERLAY_STATES.includes(value as OverlayState);

const ENERGY_ATTACK = 0.5;
const ENERGY_RELEASE = 0.12;

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

const resolveTheme = (
  preference: OverlayThemePreference,
): ResolvedOverlayTheme => {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? "dark" : "light";
};

const readDocumentTheme = (): ResolvedOverlayTheme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

interface RecordingOverlayProps {
  previewState?: OverlayState;
  previewVisible?: boolean;
  /** Fixture-only: exercise the detail/preview line without a backend. */
  previewPayload?: Partial<OverlayEventPayload>;
  /** Fixture-only: pin one treatment without touching the document theme, so a
   *  single page can show both side by side. */
  previewTheme?: ResolvedOverlayTheme;
}

const RecordingOverlay: React.FC<RecordingOverlayProps> = ({
  previewState,
  previewVisible,
  previewPayload,
  previewTheme,
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [overlay, setOverlay] = useState<OverlayEventPayload>({
    state: "recording",
    canCancel: true,
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [resolvedTheme, setResolvedTheme] =
    useState<ResolvedOverlayTheme>(readDocumentTheme);
  const theme = previewTheme ?? resolvedTheme;
  const levelsRef = useRef<number[]>(Array(WAVEFORM_BUCKET_COUNT).fill(0));
  const waveformSinkRef = useRef<((levels: number[]) => void) | null>(null);
  const isVisibleRef = useRef(false);
  const overlayStateRef = useRef<OverlayState>("recording");
  const recordingStartedAtRef = useRef<number | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const energyRef = useRef(0);
  const themePreferenceRef = useRef<OverlayThemePreference>("system");
  const direction = getLanguageDirection(i18n.language);

  const state = previewState ?? overlay.state;
  const visible = previewVisible ?? isVisible;
  const isRecording = state === "recording";
  const shouldRenderGpuWaveform = visible && isRecording;

  /** Push the resolved theme onto the document so the CSS token layer picks
   *  it up, exactly as the main window does. */
  const applyTheme = useCallback((preference: OverlayThemePreference) => {
    themePreferenceRef.current = preference;
    const resolved = resolveTheme(preference);
    document.documentElement.dataset.theme = resolved;
    setResolvedTheme(resolved);
  }, []);

  // The OS appearance can flip while the overlay is on screen; the payload only
  // re-syncs on the next show.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const handleChange = () => {
      if (themePreferenceRef.current === "system") {
        applyTheme("system");
      }
    };

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [applyTheme]);

  const ariaForState = useCallback(
    (value: OverlayState) => {
      switch (value) {
        case "recording":
          return t("overlay.listening");
        case "transcribing":
          return t("overlay.transcribing");
        case "processing":
          return t("overlay.processing");
        case "success":
          return t("overlay.success");
        case "error":
          return t("overlay.failed");
        case "cancelled":
          return t("overlay.cancelled");
        case "empty":
          return t("overlay.empty");
      }
    },
    [t],
  );

  const formatElapsed = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  };

  const resolvePayload = (payload: unknown): OverlayEventPayload => {
    if (typeof payload === "string" && isOverlayState(payload)) {
      return {
        state: payload,
        canCancel: payload === "recording",
      };
    }

    if (payload && typeof payload === "object") {
      const candidate = payload as Partial<OverlayEventPayload>;
      const next = isOverlayState(candidate.state)
        ? candidate.state
        : "recording";
      return {
        state: next,
        theme: candidate.theme,
        detailCode: candidate.detailCode,
        previewText: candidate.previewText,
        position: candidate.position,
        canCancel: candidate.canCancel ?? next === "recording",
      };
    }

    return resolvePayload("recording");
  };

  useEffect(() => {
    if (previewState) return;

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const setupEventListeners = async () => {
      const listeners = await Promise.all([
        listen("show-overlay", (event) => {
          const nextOverlay = resolvePayload(event.payload);
          applyTheme(nextOverlay.theme ?? "system");
          overlayStateRef.current = nextOverlay.state;
          isVisibleRef.current = true;
          if (nextOverlay.state === "recording") {
            recordingStartedAtRef.current = Date.now();
            setElapsedSeconds(0);
          } else {
            recordingStartedAtRef.current = null;
            energyRef.current = 0;
            pillRef.current?.style.setProperty("--overlay-energy", "0");
          }
          setOverlay(nextOverlay);
          setIsVisible(true);
          // Language sync is a round-trip to Rust; never let it gate the paint.
          void syncLanguageFromSettings();
        }),
        listen("hide-overlay", () => {
          isVisibleRef.current = false;
          recordingStartedAtRef.current = null;
          setElapsedSeconds(0);
          setIsVisible(false);
        }),
        listen<number[]>("mic-level", (event) => {
          const newLevels = event.payload as number[];
          const nextLevels = levelsRef.current;
          let sum = 0;
          for (let index = 0; index < WAVEFORM_BUCKET_COUNT; index += 1) {
            const value = newLevels[index] ?? 0;
            nextLevels[index] = value;
            sum += value;
          }

          if (
            isVisibleRef.current &&
            overlayStateRef.current === "recording" &&
            waveformSinkRef.current
          ) {
            waveformSinkRef.current(nextLevels);

            const average = sum / WAVEFORM_BUCKET_COUNT;
            const shaped = Math.min(1, Math.pow(average, 0.55) * 1.5);
            const smoothing =
              shaped > energyRef.current ? ENERGY_ATTACK : ENERGY_RELEASE;
            energyRef.current += (shaped - energyRef.current) * smoothing;
            pillRef.current?.style.setProperty(
              "--overlay-energy",
              energyRef.current.toFixed(3),
            );
          }
        }),
      ]);

      if (disposed) {
        listeners.forEach((unlisten) => unlisten());
        return;
      }

      unlisteners.push(...listeners);
    };

    void setupEventListeners();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [applyTheme, previewState, t]);

  useEffect(() => {
    if (!visible || !isRecording) return;

    const timer = window.setInterval(() => {
      if (recordingStartedAtRef.current === null) {
        setElapsedSeconds(0);
        return;
      }

      setElapsedSeconds(
        Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording, visible]);

  const showElapsed = isRecording && elapsedSeconds >= 5;
  const stateLabel = ariaForState(state);

  const payload = previewPayload ?? overlay;

  // A transcript excerpt is the most useful thing we can show, so it wins over
  // the generic per-state detail line.
  const detailText = useMemo(() => {
    if (payload.previewText) return payload.previewText;
    if (payload.detailCode) return t(`overlay.detail.${payload.detailCode}`);
    return undefined;
  }, [payload.detailCode, payload.previewText, t]);

  const isQuoted = Boolean(payload.previewText);
  const announcement = [stateLabel, detailText].filter(Boolean).join(". ");

  return (
    <div
      className="overlay-stage"
      dir={direction}
      data-overlay-theme={theme}
      data-position={payload.position ?? "bottom"}
    >
      <div
        ref={pillRef}
        className={`overlay-pill ${visible ? "is-visible" : ""}`}
        data-state={state}
        data-has-detail={detailText ? "true" : "false"}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={announcement}
      >
        <div className="overlay-grain" aria-hidden="true" />
        <div className="overlay-sheen" aria-hidden="true" />

        <div className="overlay-waveform-bay" aria-hidden="true">
          {shouldRenderGpuWaveform ? (
            <GpuWaveformStage
              initialLevels={levelsRef.current}
              isActive={shouldRenderGpuWaveform}
              theme={theme}
              onReady={(pushLevels) => {
                waveformSinkRef.current = pushLevels;
                pushLevels(levelsRef.current);
              }}
              onTeardown={() => {
                waveformSinkRef.current = null;
              }}
            />
          ) : (
            <div className="gpu-waveform-host is-dormant" aria-hidden="true" />
          )}
        </div>

        <div className="overlay-spine" aria-hidden="true">
          <div className="overlay-node overlay-node-echo" />
          <div className="overlay-node overlay-node-lead" />
          <div className="overlay-ring" />
        </div>

        {showElapsed ? (
          <div className="overlay-timer" aria-hidden="true">
            {formatElapsed(elapsedSeconds)}
          </div>
        ) : null}

        <div className="overlay-copy" key={state}>
          <div className="overlay-label">{stateLabel}</div>
          {detailText ? (
            <div
              className="overlay-detail"
              data-quoted={isQuoted ? "true" : "false"}
            >
              {detailText}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RecordingOverlay;
