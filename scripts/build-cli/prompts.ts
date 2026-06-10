import * as p from "@clack/prompts";
import type {
  Architecture,
  BuildCommand,
  BuildMode,
  Bundle,
  CliOptions,
  HostPlatform,
} from "./types";
import { CliError } from "./types";
import { defaultBundles } from "./plan";

function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Build cancelled.");
    throw new CliError("Cancelled.", 130);
  }
  return value as T;
}

export async function promptForOptions(
  current: CliOptions,
  platform: HostPlatform,
): Promise<CliOptions> {
  p.intro("SilkScribe native build");
  const command =
    current.command ??
    unwrap(
      await p.select<BuildCommand>({
        message: "What do you want to do?",
        options: [
          { value: "build", label: "Build", hint: "incremental release build" },
          { value: "rebuild", label: "Rebuild", hint: "clean then build" },
          { value: "clean", label: "Clean", hint: "remove generated outputs" },
          { value: "doctor", label: "Doctor", hint: "validate this machine" },
        ],
      }),
    );
  const mode =
    current.mode ??
    unwrap(
      await p.select<BuildMode>({
        message: "Build mode",
        options: [
          { value: "adhoc", label: "Ad hoc", hint: "local testing" },
          {
            value: "distribution",
            label: "Distribution",
            hint:
              platform === "macos"
                ? "signed and notarized"
                : platform === "windows"
                  ? "Azure Trusted Signed"
                  : "updater signed",
          },
        ],
      }),
    );
  const arch =
    current.arch ??
    (platform === "macos"
      ? unwrap(
          await p.select<Architecture>({
            message: "Architecture",
            options: [
              { value: "host", label: "Host", hint: process.arch },
              { value: "universal", label: "Universal", hint: "Apple + Intel" },
              { value: "aarch64", label: "Apple Silicon" },
              { value: "x86_64", label: "Intel" },
            ],
          }),
        )
      : "host");
  const available = defaultBundles(platform);
  const selectedBundles =
    current.bundles ??
    unwrap(
      await p.multiselect<Bundle>({
        message: "Bundle formats",
        options: available.map((bundle) => ({
          value: bundle,
          label: bundle,
        })),
        initialValues: available,
        required: true,
      }),
    );
  return {
    ...current,
    command,
    mode,
    arch,
    bundles: selectedBundles,
  };
}

export async function confirmPlan(summary: string): Promise<void> {
  p.note(summary, "Review");
  const confirmed = unwrap(
    await p.confirm({ message: "Run this plan?", initialValue: true }),
  );
  if (!confirmed) {
    p.cancel("No changes made.");
    throw new CliError("Cancelled.", 130);
  }
}

export function showChecks(
  checks: Array<{ status: string; name: string; message: string }>,
): void {
  for (const check of checks) {
    const line = `${check.name}: ${check.message}`;
    if (check.status === "passed") p.log.success(line);
    else if (check.status === "warning" || check.status === "skipped")
      p.log.warn(line);
    else p.log.error(line);
  }
}
