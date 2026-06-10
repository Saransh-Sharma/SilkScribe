import fs from "node:fs";
import path from "node:path";
import type { CommandResult, CommandSpec } from "./types";
import { CliError } from "./types";

const secretPattern =
  /(APPLE_API_PRIVATE_KEY|APPLE_CERTIFICATE|APPLE_CERTIFICATE_PASSWORD|APPLE_PASSWORD|AZURE_CLIENT_SECRET|TAURI_SIGNING_PRIVATE_KEY(?:_PASSWORD)?)=([^\s]+)/gi;
const activeCommands = new Set<ReturnType<typeof Bun.spawn>>();

export function cancelActiveCommands(): void {
  for (const child of activeCommands) {
    try {
      if (process.platform === "win32") child.kill();
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill();
    }
  }
}

export function redact(value: string): string {
  let redacted = value.replace(secretPattern, "$1=[REDACTED]");
  for (const name of [
    "APPLE_API_PRIVATE_KEY",
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_PASSWORD",
    "AZURE_CLIENT_SECRET",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  ]) {
    const secret = process.env[name];
    if (secret) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}

export function formatCommand(spec: CommandSpec): string {
  return redact(
    spec.display ??
      [spec.command, ...spec.args]
        .map((part) => (/[\s"]/u.test(part) ? JSON.stringify(part) : part))
        .join(" "),
  );
}

export async function runCommand(
  spec: CommandSpec,
  options: {
    logPath?: string;
    verbose?: boolean;
    allowFailure?: boolean;
  } = {},
): Promise<CommandResult> {
  if (options.logPath) {
    fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
    fs.appendFileSync(options.logPath, `$ ${formatCommand(spec)}\n`);
  }
  const child = Bun.spawn([spec.command, ...spec.args], {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdout: "pipe",
    stderr: "pipe",
    detached: process.platform !== "win32",
  });
  activeCommands.add(child);
  const consume = async (
    stream: ReadableStream<Uint8Array>,
    destination: NodeJS.WriteStream,
  ): Promise<string> => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let output = "";
    const emit = (value: string) => {
      const safe = redact(value);
      output += safe;
      if (options.verbose) destination.write(safe);
      if (options.logPath) fs.appendFileSync(options.logPath, safe);
    };
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        emit(pending.slice(0, newline + 1));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
      if (done) break;
    }
    if (pending) emit(pending);
    return output;
  };
  const [stdout, stderr, exitCode] = await Promise.all([
    consume(child.stdout, process.stdout),
    consume(child.stderr, process.stderr),
    child.exited,
  ]);
  activeCommands.delete(child);
  if (options.logPath) fs.appendFileSync(options.logPath, "\n");
  if (exitCode !== 0 && !options.allowFailure) {
    throw new CliError(
      `Command failed (${exitCode}): ${formatCommand(spec)}`,
      1,
      "troubleshooting",
      "command",
    );
  }
  return { exitCode, stdout, stderr };
}
