#!/usr/bin/env bun
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import { copyArtifacts, discoverArtifacts, writeManifest } from "./artifacts";
import { parseCliArgs } from "./args";
import { cleanPaths } from "./clean";
import { renderHelp } from "./help";
import { createBuildPlan, detectPlatform } from "./plan";
import { preflightPassed, runPreflight } from "./preflight";
import { confirmPlan, promptForOptions, showChecks } from "./prompts";
import { cancelActiveCommands, formatCommand, runCommand } from "./runner";
import { CliError } from "./types";
import { verifyArtifacts } from "./verify";

const root = path.resolve(import.meta.dir, "../..");

function readVersion(): string {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    .version;
}

function summary(plan: ReturnType<typeof createBuildPlan>): string {
  return [
    `Command: ${plan.command}`,
    `Platform: ${plan.platform}`,
    `Mode: ${plan.mode}`,
    `Architecture: ${plan.architecture}`,
    `Bundles: ${plan.bundles.join(", ")}`,
    `Updater artifacts: ${plan.updaterArtifacts ? "yes" : "no"}`,
    `Output: ${plan.artifactDirectory}`,
    `Tauri: bun ${plan.tauriArgs.join(" ")}`,
    ...(plan.command === "rebuild" || plan.command === "clean"
      ? [`Clean:\n${plan.cleanPaths.map((item) => `  ${item}`).join("\n")}`]
      : []),
  ].join("\n");
}

function openDirectory(directory: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", directory]
      : process.platform === "win32"
        ? ["explorer", directory]
        : ["xdg-open", directory];
  spawn(command[0], command.slice(1), {
    detached: true,
    stdio: "ignore",
  }).unref();
}

async function detachTemporaryDmgVolumes(logPath: string): Promise<number> {
  const mounts = await runCommand(
    { command: "mount", args: [], cwd: root },
    { allowFailure: true, logPath },
  );
  const devices = new Set(
    mounts.stdout
      .split("\n")
      .filter((line) => line.includes(" on /Volumes/dmg."))
      .map((line) => line.split(" on ")[0])
      .map((device) => device.replace(/s\d+$/u, "")),
  );
  for (const device of devices) {
    await runCommand(
      { command: "hdiutil", args: ["detach", "-force", device], cwd: root },
      { allowFailure: true, logPath, verbose: true },
    );
  }
  return devices.size;
}

async function runBuildCommand(
  plan: ReturnType<typeof createBuildPlan>,
  environment: Record<string, string>,
  logPath: string,
): Promise<void> {
  const spec = {
    command: "bun",
    args: plan.tauriArgs,
    cwd: root,
    env: environment,
  };
  let result = await runCommand(spec, {
    logPath,
    verbose: plan.verbose,
    allowFailure: true,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const retryDmg =
    result.exitCode !== 0 &&
    plan.platform === "macos" &&
    plan.bundles.includes("dmg") &&
    /Resource busy|currently in use/iu.test(output);
  if (retryDmg) {
    const detached = await detachTemporaryDmgVolumes(logPath);
    console.warn(
      `DMG volume was busy. Detached ${detached} temporary volume(s); retrying once.`,
    );
    result = await runCommand(spec, {
      logPath,
      verbose: plan.verbose,
      allowFailure: true,
    });
  }
  if (result.exitCode !== 0) {
    throw new CliError(
      `Build command failed (${result.exitCode}). Retained log: ${logPath}`,
      1,
      "troubleshooting",
      "build",
    );
  }
}

async function main(): Promise<void> {
  let options = parseCliArgs(process.argv.slice(2));
  if (options.version) {
    console.log(readVersion());
    return;
  }
  if (options.help || options.command === "help") {
    console.log(renderHelp(options.topic));
    return;
  }

  const platform = detectPlatform();
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!options.command) {
    if (!interactive) {
      throw new CliError(
        "A command is required in non-interactive mode.",
        2,
        "commands",
        "arguments",
      );
    }
    options = await promptForOptions(options, platform);
  } else if (
    interactive &&
    ["build", "rebuild", "clean", "doctor"].includes(options.command) &&
    (!options.mode || !options.arch || !options.bundles)
  ) {
    options = await promptForOptions(options, platform);
  }

  const command = options.command;
  if (!command || command === "help") return;
  const plan = createBuildPlan({
    root,
    command,
    platform,
    mode: options.mode ?? "adhoc",
    arch: options.arch ?? "host",
    bundles: options.bundles,
    output: options.output,
    version: readVersion(),
    dryRun: options.dryRun,
    verbose: options.verbose,
    open: options.open,
  });
  if (interactive && !options.yes) await confirmPlan(summary(plan));
  else console.log(`${summary(plan)}\n`);

  const preflight = await runPreflight(plan, root);
  showChecks(preflight.checks);
  if (!preflightPassed(preflight)) {
    const topics = [
      ...new Set(
        preflight.checks
          .filter((check) => check.status === "failed")
          .map((check) => check.helpTopic)
          .filter(Boolean),
      ),
    ];
    throw new CliError(
      `Preflight failed.${topics.map((topic) => `\nRun: bun run app:build -- help ${topic}`).join("")}`,
      1,
      topics[0],
      "preflight",
    );
  }
  if (command === "doctor") {
    p.outro("This machine is ready for the selected build.");
    return;
  }

  if (command === "clean" || command === "rebuild") {
    console.log("\nCleanup paths:");
    plan.cleanPaths.forEach((item) => console.log(`  ${item}`));
    cleanPaths(plan.cleanPaths, root, plan.outputRoot, plan.dryRun);
    if (command === "clean") {
      p.outro(plan.dryRun ? "Dry run complete." : "Generated outputs removed.");
      return;
    }
  }

  console.log(
    `\nBuild command:\n  ${formatCommand({
      command: "bun",
      args: plan.tauriArgs,
      cwd: root,
    })}`,
  );
  if (plan.dryRun) {
    p.outro("Dry run complete. No files were changed.");
    return;
  }

  const startedAt = new Date().toISOString();
  fs.mkdirSync(plan.artifactDirectory, { recursive: true });
  const logPath = path.join(plan.artifactDirectory, "build.log");
  await runBuildCommand(plan, preflight.environment, logPath);
  const sources = discoverArtifacts(plan);
  const verification = await verifyArtifacts(plan, sources, root);
  const artifacts = copyArtifacts(plan, sources);
  await writeManifest(plan, root, startedAt, artifacts, verification);
  p.outro(`Build complete: ${plan.artifactDirectory}`);
  if (plan.open) openDirectory(plan.artifactDirectory);
}

process.on("SIGINT", () => {
  console.error("\nCancelled.");
  cancelActiveCommands();
  process.exit(130);
});

main().catch((error: unknown) => {
  if (error instanceof CliError) {
    if (error.message !== "Cancelled.") {
      console.error(`${error.phase ? `${error.phase}: ` : ""}${error.message}`);
      if (error.helpTopic) {
        console.error(`Run: bun run app:build -- help ${error.helpTopic}`);
      }
    }
    process.exit(error.exitCode);
  }
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`System: ${os.platform()} ${os.arch()}`);
  process.exit(1);
});
