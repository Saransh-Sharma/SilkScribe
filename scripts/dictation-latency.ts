/**
 * Summarise dictation latency from SilkScribe's log files.
 *
 * Each finished dictation logs one `dictation_timing` line with the time from
 * releasing the shortcut to each stage (see TranscribeAction::stop in
 * src-tauri/src/actions.rs). This prints p50/p95 per engine so a change can be
 * compared against a baseline.
 *
 * Usage: bun scripts/dictation-latency.ts [log files or folders...] [--json]
 * Default: the app's log folder (~/Library/Logs/com.silkscribe.app on macOS).
 */
import fs from "fs";
import os from "os";
import path from "path";

const STAGES = [
  "stop_ms",
  "asr_ms",
  "text_ms",
  "paste_ms",
  "total_ms",
] as const;
type Stage = (typeof STAGES)[number];

interface Sample {
  engine: string;
  cleanup: string;
  audio_ms: number;
  values: Record<Stage, number>;
}

function defaultLogDirs(): string[] {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return [path.join(home, "Library", "Logs", "com.silkscribe.app")];
    case "win32":
      return [
        path.join(
          process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"),
          "com.silkscribe.app",
          "logs",
        ),
      ];
    default:
      return [
        path.join(
          process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"),
          "com.silkscribe.app",
          "logs",
        ),
      ];
  }
}

function logFiles(inputs: string[]): string[] {
  return inputs.flatMap((input) => {
    if (!fs.existsSync(input)) return [];
    if (fs.statSync(input).isDirectory()) {
      return fs
        .readdirSync(input)
        .filter((name) => name.endsWith(".log"))
        .map((name) => path.join(input, name));
    }
    return [input];
  });
}

export function parseLine(line: string): Sample | null {
  if (!line.includes("dictation_timing")) return null;
  const fields = new Map<string, string>();
  for (const match of line.matchAll(/(\w+)=(\S+)/g)) {
    fields.set(match[1], match[2]);
  }
  const values = {} as Record<Stage, number>;
  for (const stage of STAGES) {
    const value = Number(fields.get(stage));
    if (!Number.isFinite(value)) return null;
    values[stage] = value;
  }
  return {
    engine: fields.get("engine") ?? "unknown",
    cleanup: fields.get("cleanup") ?? "unknown",
    audio_ms: Number(fields.get("audio_ms") ?? NaN),
    values,
  };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function summarise(samples: Sample[]) {
  const byEngine = new Map<string, Sample[]>();
  for (const sample of samples) {
    const key = `${sample.engine} (cleanup: ${sample.cleanup})`;
    byEngine.set(key, [...(byEngine.get(key) ?? []), sample]);
  }
  return [...byEngine.entries()].map(([group, items]) => ({
    group,
    count: items.length,
    stages: Object.fromEntries(
      STAGES.map((stage) => {
        const sorted = items.map((s) => s.values[stage]).sort((a, b) => a - b);
        return [
          stage,
          { p50: percentile(sorted, 50), p95: percentile(sorted, 95) },
        ];
      }),
    ),
  }));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const inputs = args.filter((arg) => !arg.startsWith("--"));
  const files = logFiles(inputs.length ? inputs : defaultLogDirs());
  const samples = files.flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map(parseLine)
      .filter((sample): sample is Sample => sample !== null),
  );

  if (samples.length === 0) {
    console.error(
      `No dictation_timing lines found in ${files.length ? files.join(", ") : "the default log folder"}.`,
    );
    process.exit(1);
  }

  const summary = summarise(samples);
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    for (const { group, count, stages } of summary) {
      console.log(`\n${group} — ${count} dictation${count === 1 ? "" : "s"}`);
      console.log("  stage (ms from shortcut release)   p50     p95");
      for (const stage of STAGES) {
        const { p50, p95 } = stages[stage];
        console.log(
          `  ${stage.padEnd(33)}${String(p50).padStart(6)}  ${String(p95).padStart(6)}`,
        );
      }
    }
  }
}
