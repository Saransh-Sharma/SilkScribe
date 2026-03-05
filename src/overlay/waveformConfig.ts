export const WAVEFORM_BUCKET_COUNT = 16;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const shapeWaveformLevel = (level: number) =>
  clamp(Math.pow(clamp(level, 0, 1), 0.38) * 1.12, 0, 1);
