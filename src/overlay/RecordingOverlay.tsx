import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import {
  MicrophoneIcon,
  TranscriptionIcon,
  CancelIcon,
} from "../components/icons";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState =
  | "recording"
  | "transcribing"
  | "processing"
  | "success"
  | "error";

interface OverlayEventPayload {
  state: OverlayState;
  title?: string;
  detail?: string;
  previewText?: string;
  canCancel: boolean;
}

const isOverlayState = (value: unknown): value is OverlayState =>
  typeof value === "string" &&
  ["recording", "transcribing", "processing", "success", "error"].includes(
    value,
  );

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [overlay, setOverlay] = useState<OverlayEventPayload>({
    state: "recording",
    canCancel: true,
  });
  const [levels, setLevels] = useState<number[]>(Array(12).fill(0));
  const smoothedLevelsRef = useRef<number[]>(Array(12).fill(0));
  const direction = getLanguageDirection(i18n.language);

  const getDefaultCopy = (state: OverlayState) => {
    switch (state) {
      case "recording":
        return {
          title: t("overlay.listening"),
          detail: t("overlay.listeningDetail"),
        };
      case "transcribing":
        return {
          title: t("overlay.transcribing"),
          detail: t("overlay.transcribingDetail"),
        };
      case "processing":
        return {
          title: t("overlay.processing"),
          detail: t("overlay.processingDetail"),
        };
      case "success":
        return {
          title: t("overlay.success"),
          detail: t("overlay.successDetail"),
        };
      case "error":
        return {
          title: t("overlay.error"),
          detail: t("overlay.errorDetail"),
        };
    }
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
      const state = isOverlayState(candidate.state) ? candidate.state : "recording";
      return {
        state,
        title: candidate.title,
        detail: candidate.detail,
        previewText: candidate.previewText,
        canCancel: candidate.canCancel ?? state === "recording",
      };
    }

    return resolvePayload("recording");
  };

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const setupEventListeners = async () => {
      const listeners = await Promise.all([
        listen("show-overlay", async (event) => {
          await syncLanguageFromSettings();
          setOverlay(resolvePayload(event.payload));
          setIsVisible(true);
        }),
        listen("hide-overlay", () => {
          setIsVisible(false);
        }),
        listen<number[]>("mic-level", (event) => {
          const newLevels = event.payload as number[];
          const smoothed = smoothedLevelsRef.current.map((prev, i) => {
            const target = newLevels[i] || 0;
            return prev * 0.55 + target * 0.45;
          });

          smoothedLevelsRef.current = smoothed;
          setLevels(smoothed);
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
  }, [t]);

  const overlayCopy = getDefaultCopy(overlay.state);
  const title = overlay.title || overlayCopy.title;
  const detail = overlay.previewText || overlay.detail || overlayCopy.detail;
  const isRecording = overlay.state === "recording";
  const isProgressState =
    overlay.state === "transcribing" || overlay.state === "processing";
  const rawAverageLevel = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  const waveformBars = levels.map((value) => ({
    scale: Math.max(0.18, Math.min(1, value)),
    opacity: Math.max(0.4, Math.min(1, 0.45 + value * 0.75)),
  }));
  const isIdleWaveform = isRecording && rawAverageLevel < 0.06;

  const getIcon = () => {
    switch (overlay.state) {
      case "recording":
        return <MicrophoneIcon />;
      case "success":
        return <CheckCircle2 className="overlay-lucide" />;
      case "error":
        return <AlertCircle className="overlay-lucide" />;
      case "transcribing":
      case "processing":
      default:
        return <TranscriptionIcon />;
    }
  };

  return (
    <div
      dir={direction}
      className={`recording-overlay ${isVisible ? "is-visible" : ""} state-${overlay.state}`}
    >
      <div className="overlay-header">
        <div className="overlay-left">
          <div className="overlay-icon-shell">{getIcon()}</div>
        </div>

        <div className="overlay-copy">
          <div className="overlay-title">{title}</div>
        </div>

        <div className="overlay-right">
          {overlay.canCancel && (
            <button
              type="button"
              className="cancel-button"
              onClick={() => {
                commands.cancelOperation();
              }}
              aria-label={t("modelSelector.cancel")}
            >
              <CancelIcon />
            </button>
          )}
        </div>
      </div>

      <div className="overlay-footer">
        {isRecording ? (
          <div
            className={`bars-container ${isIdleWaveform ? "is-idle" : ""}`}
            aria-hidden="true"
          >
            {waveformBars.map((bar, i) => (
              <div
                key={i}
                className="bar"
                style={{
                  ["--bar-index" as string]: i,
                  transform: `scaleY(${bar.scale})`,
                  opacity: bar.opacity,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="overlay-statusblock">
            {detail && <div className="overlay-inline-detail">{detail}</div>}
            <div className="overlay-statusline">
              {isProgressState && (
                <span className="overlay-spinner" aria-hidden="true">
                  <LoaderCircle className="overlay-lucide spinning" />
                </span>
              )}
              {overlay.state === "success" && (
                <span className="overlay-pill success">
                  {t("overlay.successPill")}
                </span>
              )}
              {overlay.state === "error" && (
                <span className="overlay-pill error">
                  {t("overlay.errorPill")}
                </span>
              )}
              {isProgressState && (
                <div className="overlay-progress-track" aria-hidden="true">
                  <div className="overlay-progress-indicator" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingOverlay;
