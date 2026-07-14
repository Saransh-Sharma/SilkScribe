import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
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
  | "cancelled";

interface OverlayEventPayload {
  state: OverlayState;
  title?: string;
  detail?: string;
  previewText?: string;
  canCancel: boolean;
}

const isOverlayState = (value: unknown): value is OverlayState =>
  typeof value === "string" &&
  [
    "recording",
    "transcribing",
    "processing",
    "success",
    "error",
    "cancelled",
  ].includes(value);

const ENERGY_ATTACK = 0.5;
const ENERGY_RELEASE = 0.12;

interface RecordingOverlayProps {
  previewState?: OverlayState;
  previewVisible?: boolean;
}

const RecordingOverlay: React.FC<RecordingOverlayProps> = ({
  previewState,
  previewVisible,
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [overlay, setOverlay] = useState<OverlayEventPayload>({
    state: "recording",
    canCancel: true,
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const levelsRef = useRef<number[]>(Array(WAVEFORM_BUCKET_COUNT).fill(0));
  const waveformSinkRef = useRef<((levels: number[]) => void) | null>(null);
  const isVisibleRef = useRef(false);
  const overlayStateRef = useRef<OverlayState>("recording");
  const recordingStartedAtRef = useRef<number | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const energyRef = useRef(0);
  const direction = getLanguageDirection(i18n.language);

  const state = previewState ?? overlay.state;
  const visible = previewVisible ?? isVisible;
  const isRecording = state === "recording";
  const shouldRenderGpuWaveform = visible && isRecording;

  const ariaForState = (value: OverlayState) => {
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
    }
  };

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
        title: candidate.title,
        detail: candidate.detail,
        previewText: candidate.previewText,
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
        listen("show-overlay", async (event) => {
          await syncLanguageFromSettings();
          const nextOverlay = resolvePayload(event.payload);
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
  }, [previewState, t]);

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
  const detailText =
    overlay.detail ??
    (state === "cancelled" ? t("overlay.cancelledDetail") : undefined);
  const announcement = [stateLabel, detailText].filter(Boolean).join(". ");

  return (
    <div className="overlay-stage" dir={direction}>
      <div
        ref={pillRef}
        className={`overlay-pill ${visible ? "is-visible" : ""}`}
        data-state={state}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={announcement}
      >
        <div className="overlay-grain" aria-hidden="true" />

        <div className="overlay-waveform-bay" aria-hidden="true">
          {shouldRenderGpuWaveform ? (
            <GpuWaveformStage
              initialLevels={levelsRef.current}
              isActive={shouldRenderGpuWaveform}
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

        <div className="overlay-copy">
          <div className="overlay-label">{stateLabel}</div>
          {detailText ? (
            <div className="overlay-detail">{detailText}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RecordingOverlay;
