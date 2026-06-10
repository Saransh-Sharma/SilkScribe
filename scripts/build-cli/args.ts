import { parseArgs } from "node:util";
import type {
  Architecture,
  BuildCommand,
  BuildMode,
  Bundle,
  CliOptions,
} from "./types";
import { CliError } from "./types";

const commands = new Set(["build", "rebuild", "clean", "doctor", "help"]);
const modes = new Set<BuildMode>(["adhoc", "distribution"]);
const architectures = new Set<Architecture>([
  "host",
  "aarch64",
  "x86_64",
  "universal",
]);
const bundles = new Set<Bundle>([
  "app",
  "dmg",
  "nsis",
  "msi",
  "appimage",
  "deb",
  "rpm",
]);

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

export function parseCliArgs(argv: string[]): CliOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        mode: { type: "string" },
        arch: { type: "string" },
        bundles: { type: "string" },
        output: { type: "string" },
        yes: { type: "boolean", short: "y", default: false },
        open: { type: "boolean" },
        "no-open": { type: "boolean" },
        verbose: { type: "boolean", short: "v", default: false },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "V", default: false },
      },
    });
  } catch (error) {
    throw new CliError((error as Error).message, 2, "commands", "arguments");
  }

  const [rawCommand, topic, ...extra] = parsed.positionals;
  if (extra.length > 0) {
    throw new CliError(
      `Unexpected arguments: ${extra.join(" ")}`,
      2,
      "commands",
      "arguments",
    );
  }
  if (rawCommand && !commands.has(rawCommand)) {
    const suggestion = [...commands].sort(
      (a, b) => editDistance(rawCommand, a) - editDistance(rawCommand, b),
    )[0];
    throw new CliError(
      `Unknown command "${rawCommand}". Did you mean "${suggestion}"?`,
      2,
      "commands",
      "arguments",
    );
  }
  if (rawCommand !== "help" && topic) {
    throw new CliError(
      `Unexpected argument "${topic}" after ${rawCommand}.`,
      2,
      "commands",
      "arguments",
    );
  }

  const mode = parsed.values.mode as BuildMode | undefined;
  if (mode && !modes.has(mode)) {
    throw new CliError(
      `Invalid mode "${mode}". Use adhoc or distribution.`,
      2,
      "modes",
      "arguments",
    );
  }

  const arch = parsed.values.arch as Architecture | undefined;
  if (arch && !architectures.has(arch)) {
    throw new CliError(
      `Invalid architecture "${arch}".`,
      2,
      "commands",
      "arguments",
    );
  }

  const bundleValue = parsed.values.bundles as string | undefined;
  const selectedBundles = bundleValue
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) as Bundle[] | undefined;
  const invalidBundle = selectedBundles?.find((value) => !bundles.has(value));
  if (invalidBundle) {
    throw new CliError(
      `Invalid bundle "${invalidBundle}".`,
      2,
      "modes",
      "arguments",
    );
  }

  return {
    command: rawCommand as BuildCommand | "help" | undefined,
    topic,
    mode,
    arch,
    bundles: selectedBundles,
    output: parsed.values.output as string | undefined,
    yes: Boolean(parsed.values.yes),
    open: parsed.values["no-open"] ? false : parsed.values.open !== false,
    verbose: Boolean(parsed.values.verbose),
    dryRun: Boolean(parsed.values["dry-run"]),
    help: Boolean(parsed.values.help),
    version: Boolean(parsed.values.version),
  };
}
