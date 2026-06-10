import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cancelActiveCommands, runCommand } from "./runner";

const temporary: string[] = [];

afterEach(() => {
  temporary
    .splice(0)
    .forEach((item) => fs.rmSync(item, { recursive: true, force: true }));
});

describe("command runner", () => {
  test("captures output and writes a retained log", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "silkscribe-runner-"));
    temporary.push(root);
    const logPath = path.join(root, "logs/build.log");
    const result = await runCommand(
      { command: "sh", args: ["-c", "printf 'first\\nsecond\\n'"], cwd: root },
      { logPath },
    );
    expect(result.stdout).toBe("first\nsecond\n");
    expect(fs.readFileSync(logPath, "utf8")).toContain("first\nsecond\n");
  });

  test("returns non-zero status when failure is allowed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "silkscribe-runner-"));
    temporary.push(root);
    const result = await runCommand(
      { command: "sh", args: ["-c", "printf 'failed' >&2; exit 7"], cwd: root },
      { allowFailure: true },
    );
    expect(result.exitCode).toBe(7);
    expect(result.stderr).toBe("failed");
  });

  test("throws with the failed command otherwise", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "silkscribe-runner-"));
    temporary.push(root);
    await expect(
      runCommand({ command: "sh", args: ["-c", "exit 3"], cwd: root }),
    ).rejects.toThrow("Command failed (3)");
  });

  test("cancels the active process group", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "silkscribe-runner-"));
    temporary.push(root);
    const started = Date.now();
    const running = runCommand(
      { command: "sh", args: ["-c", "sleep 10"], cwd: root },
      { allowFailure: true },
    );
    setTimeout(cancelActiveCommands, 50);
    const result = await running;
    expect(result.exitCode).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
