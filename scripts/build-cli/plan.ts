import path from "node:path";
import type {
  Architecture,
  BuildCommand,
  BuildMode,
  BuildPlan,
  Bundle,
  HostPlatform,
} from "./types";
import { CliError } from "./types";

const platformBundles: Record<HostPlatform, Bundle[]> = {
  macos: ["app", "dmg"],
  windows: ["nsis", "msi"],
  linux: ["appimage", "deb", "rpm"],
};

export function detectPlatform(platform = process.platform): HostPlatform {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  if (platform === "linux") return "linux";
  throw new CliError(
    `Unsupported host platform "${platform}".`,
    1,
    "commands",
    "planning",
  );
}

export function defaultBundles(platform: HostPlatform): Bundle[] {
  return [...platformBundles[platform]];
}

export function normalizeArchitecture(
  platform: HostPlatform,
  requested: Architecture,
  hostArch: string = process.arch,
): Exclude<Architecture, "host"> {
  const host = hostArch === "arm64" ? "aarch64" : "x86_64";
  if (requested === "host") return host;
  if (platform !== "macos" && requested !== host) {
    throw new CliError(
      `${platform} v1 builds support only the host architecture (${host}).`,
      2,
      platform,
      "planning",
    );
  }
  return requested;
}

export function targetFor(
  platform: HostPlatform,
  architecture: Exclude<Architecture, "host">,
): string {
  if (platform === "macos") {
    if (architecture === "universal") return "universal-apple-darwin";
    return `${architecture}-apple-darwin`;
  }
  if (architecture === "universal") {
    throw new CliError(
      "Universal builds are supported only on macOS.",
      2,
      "modes",
      "planning",
    );
  }
  if (platform === "windows") return `${architecture}-pc-windows-msvc`;
  return `${architecture}-unknown-linux-gnu`;
}

export interface PlanInput {
  root: string;
  command: BuildCommand;
  platform: HostPlatform;
  mode: BuildMode;
  arch: Architecture;
  bundles?: Bundle[];
  output?: string;
  version: string;
  hostArch?: string;
  dryRun?: boolean;
  verbose?: boolean;
  open?: boolean;
}

export function createBuildPlan(input: PlanInput): BuildPlan {
  const architecture = normalizeArchitecture(
    input.platform,
    input.arch,
    input.hostArch,
  );
  const target = targetFor(input.platform, architecture);
  const selectedBundles = input.bundles?.length
    ? [...new Set(input.bundles)]
    : defaultBundles(input.platform);
  const invalid = selectedBundles.filter(
    (bundle) => !platformBundles[input.platform].includes(bundle),
  );
  if (invalid.length) {
    throw new CliError(
      `${invalid.join(", ")} cannot be built on ${input.platform}. Valid bundles: ${platformBundles[input.platform].join(", ")}.`,
      2,
      "modes",
      "planning",
    );
  }

  const outputRoot = path.resolve(input.root, input.output ?? "artifacts");
  const artifactDirectory = path.join(
    outputRoot,
    input.version,
    input.platform,
    architecture,
    input.mode,
  );
  const targetDirectory = path.join(input.root, "src-tauri", "target", target);
  const configPath = path.join(
    input.root,
    "src-tauri",
    `tauri.${input.mode}.conf.json`,
  );
  const tauriArgs = [
    "run",
    "tauri",
    "build",
    "--target",
    target,
    "--bundles",
    selectedBundles.join(","),
    "--config",
    configPath,
    "--ci",
  ];
  if (input.verbose) tauriArgs.push("-v");

  return {
    command: input.command,
    platform: input.platform,
    mode: input.mode,
    architecture,
    target,
    bundles: selectedBundles,
    outputRoot,
    artifactDirectory,
    targetDirectory,
    configPath,
    appVersion: input.version,
    updaterArtifacts: input.mode === "distribution",
    cleanPaths: [
      path.join(input.root, "dist"),
      targetDirectory,
      artifactDirectory,
    ],
    tauriArgs,
    dryRun: input.dryRun ?? false,
    verbose: input.verbose ?? false,
    open: input.open ?? true,
  };
}
