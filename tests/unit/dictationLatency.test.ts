import { expect, test } from "bun:test";
import { parseLine, percentile } from "../../scripts/dictation-latency";

const line =
  "[2026-10-06][10:12:01][dictation_timing][INFO] engine=parakeet-tdt-0.6b-v3 cleanup=NotRequested audio_ms=4200 stop_ms=31 asr_ms=212 text_ms=213 paste_ms=290 total_ms=290";

test("parses a dictation_timing line", () => {
  expect(parseLine(line)).toEqual({
    engine: "parakeet-tdt-0.6b-v3",
    partials: "off",
    cleanup: "NotRequested",
    audio_ms: 4200,
    values: {
      stop_ms: 31,
      asr_ms: 212,
      text_ms: 213,
      paste_ms: 290,
      total_ms: 290,
    },
  });
});

test("reads whether live text was on", () => {
  const withPartials = line.replace("cleanup=", "partials=on cleanup=");
  expect(parseLine(withPartials)?.partials).toBe("on");
});

test("ignores other lines and incomplete timing lines", () => {
  expect(parseLine("[INFO] Transcription completed in 210ms")).toBeNull();
  expect(parseLine("dictation_timing engine=x stop_ms=1")).toBeNull();
});

test("percentile uses the nearest-rank method", () => {
  const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  expect(percentile(sorted, 50)).toBe(50);
  expect(percentile(sorted, 95)).toBe(100);
  expect(percentile([], 50)).toBeNaN();
});
