import React, { useEffect, useMemo, useRef, useState } from "react";
import type { WaveformSceneController } from "./waveformScene";

type GpuWaveformStageProps = {
  initialLevels: number[];
  isActive: boolean;
  onReady?: (pushLevels: (levels: number[]) => void) => void;
  onTeardown?: () => void;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FALLBACK_BAR_COUNT = 18;
const RETRY_DELAYS_MS = [750, 2000, 5000] as const;

const normalizeLevels = (levels: number[]) => {
  const normalized = Array(12).fill(0);
  for (let index = 0; index < 12; index += 1) {
    normalized[index] = levels[index] ?? 0;
  }

  return normalized;
};

const GpuWaveformStage: React.FC<GpuWaveformStageProps> = ({
  initialLevels,
  isActive,
  onReady,
  onTeardown,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<WaveformSceneController | null>(null);
  const latestLevelsRef = useRef(normalizeLevels(initialLevels));
  const latestActiveRef = useRef(isActive);
  const reducedMotionRef = useRef(false);
  const rendererModeRef = useRef<"pixi" | "fallback">("pixi");
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef(0);
  const [rendererMode, setRendererMode] = useState<"pixi" | "fallback">("pixi");
  const [retryToken, setRetryToken] = useState(0);
  const [fallbackLevels, setFallbackLevels] = useState(() =>
    normalizeLevels(initialLevels),
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(REDUCED_MOTION_QUERY).matches
      : false,
  );

  const clearRetryTimer = () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    rendererModeRef.current = rendererMode;
  }, [rendererMode]);

  useEffect(() => {
    latestActiveRef.current = isActive;
    sceneRef.current?.setActive(isActive);
  }, [isActive]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const pushBridgeRef = useRef<(levels: number[]) => void>(() => undefined);
  pushBridgeRef.current = (levels: number[]) => {
    const normalized = latestLevelsRef.current;
    for (let index = 0; index < 12; index += 1) {
      normalized[index] = levels[index] ?? 0;
    }

    if (sceneRef.current) {
      sceneRef.current.updateLevels(normalized);
    }

    if (rendererModeRef.current === "fallback") {
      setFallbackLevels([...normalized]);
    }
  };

  useEffect(() => {
    const pushLevels = (levels: number[]) => {
      pushBridgeRef.current(levels);
    };

    onReady?.(pushLevels);

    return () => {
      onTeardown?.();
    };
  }, [onReady, onTeardown]);

  useEffect(() => {
    if (rendererMode !== "pixi") {
      return undefined;
    }

    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const scheduleRetry = () => {
      if (
        !latestActiveRef.current ||
        retryAttemptsRef.current >= RETRY_DELAYS_MS.length
      ) {
        return;
      }

      const delay = RETRY_DELAYS_MS[retryAttemptsRef.current];
      retryAttemptsRef.current += 1;
      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setRendererMode("pixi");
        setRetryToken((token) => token + 1);
      }, delay);
    };

    const initialize = async () => {
      try {
        const { createWaveformScene } = await import("./waveformScene");
        const scene = await createWaveformScene(host, {
          width: host.clientWidth || 272,
          height: host.clientHeight || 44,
          reducedMotion: reducedMotionRef.current,
        });

        if (disposed) {
          scene.destroy();
          return;
        }

        clearRetryTimer();
        retryAttemptsRef.current = 0;
        sceneRef.current = scene;
        scene.updateLevels(latestLevelsRef.current);
        scene.setReducedMotion(reducedMotionRef.current);
        scene.setActive(latestActiveRef.current);

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) {
            return;
          }

          scene.resize(
            Math.max(1, Math.round(entry.contentRect.width)),
            Math.max(1, Math.round(entry.contentRect.height)),
          );
        });
        resizeObserver.observe(host);
      } catch {
        if (disposed) {
          return;
        }

        sceneRef.current?.destroy();
        sceneRef.current = null;
        setRendererMode("fallback");
        setFallbackLevels([...latestLevelsRef.current]);
        scheduleRetry();
      }
    };

    void initialize();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, [rendererMode, retryToken]);

  useEffect(() => {
    if (rendererMode === "fallback" && isActive && retryAttemptsRef.current === 0) {
      setFallbackLevels([...latestLevelsRef.current]);
    }
  }, [rendererMode, isActive]);

  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, []);

  const fallbackBars = useMemo(
    () =>
      Array.from({ length: FALLBACK_BAR_COUNT }, (_, index) => {
        const progress =
          FALLBACK_BAR_COUNT > 1 ? index / (FALLBACK_BAR_COUNT - 1) : 0;
        const scaled = progress * (fallbackLevels.length - 1);
        const leftIndex = Math.floor(scaled);
        const rightIndex = Math.min(fallbackLevels.length - 1, leftIndex + 1);
        const mix = scaled - leftIndex;
        const interpolated =
          (fallbackLevels[leftIndex] ?? 0) * (1 - mix) +
          (fallbackLevels[rightIndex] ?? 0) * mix;
        const boosted = Math.pow(Math.max(0, interpolated), 0.58);
        const height = Math.max(0.16, Math.min(1, boosted * 1.2));

        return {
          height,
          tone:
            index > 6 && index < 11
              ? "pink"
              : index > 4 && index < 14
                ? "gold"
                : "ochre",
        };
      }),
    [fallbackLevels],
  );

  return (
    <div className="gpu-waveform-host" aria-hidden="true">
      {rendererMode === "fallback" ? (
        <div
          className={`gpu-waveform-fallback ${isActive ? "is-active" : ""}`}
        >
          <div className="gpu-waveform-fallback-glow" />
          <div className="gpu-waveform-fallback-bars">
            {fallbackBars.map((bar, index) => (
              <div
                key={index}
                className={`gpu-waveform-fallback-bar tone-${bar.tone}`}
                style={
                  {
                    ["--fallback-scale" as string]: String(bar.height),
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div ref={hostRef} className="gpu-waveform-mount" />
      )}
    </div>
  );
};

export default GpuWaveformStage;
