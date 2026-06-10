export type BuildCommand = "build" | "rebuild" | "clean" | "doctor";
export type HostPlatform = "macos" | "windows" | "linux";
export type BuildMode = "adhoc" | "distribution";
export type Architecture = "host" | "aarch64" | "x86_64" | "universal";
export type MacBundle = "app" | "dmg";
export type WindowsBundle = "nsis" | "msi";
export type LinuxBundle = "appimage" | "deb" | "rpm";
export type Bundle = MacBundle | WindowsBundle | LinuxBundle;

export interface CliOptions {
  command?: BuildCommand | "help";
  topic?: string;
  mode?: BuildMode;
  arch?: Architecture;
  bundles?: Bundle[];
  output?: string;
  yes: boolean;
  open: boolean;
  verbose: boolean;
  dryRun: boolean;
  help: boolean;
  version: boolean;
}

export interface BuildPlan {
  command: BuildCommand;
  platform: HostPlatform;
  mode: BuildMode;
  architecture: Exclude<Architecture, "host">;
  target: string;
  bundles: Bundle[];
  outputRoot: string;
  artifactDirectory: string;
  targetDirectory: string;
  configPath: string;
  appVersion: string;
  updaterArtifacts: boolean;
  cleanPaths: string[];
  tauriArgs: string[];
  dryRun: boolean;
  verbose: boolean;
  open: boolean;
}

export interface CheckResult {
  name: string;
  status: "passed" | "failed" | "warning" | "skipped";
  message: string;
  helpTopic?: string;
}

export interface PreflightResult {
  checks: CheckResult[];
  environment: Record<string, string>;
}

export interface CommandSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  display?: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface VerificationResult {
  check: string;
  status: "passed" | "skipped";
}

export interface CollectedArtifact {
  name: string;
  path: string;
  size: number;
  sha256: string;
  kind: string;
}

export interface ArtifactManifest {
  schemaVersion: 1;
  appVersion: string;
  platform: HostPlatform;
  architecture: string;
  mode: BuildMode;
  bundles: string[];
  git: { commit: string; dirty: boolean };
  startedAt: string;
  completedAt: string;
  artifacts: CollectedArtifact[];
  verification: VerificationResult[];
}

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
    public readonly helpTopic?: string,
    public readonly phase?: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}
