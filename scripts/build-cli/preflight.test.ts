import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBuildPlan } from "./plan";
import { preflightPassed, runPreflight } from "./preflight";
import type { CommandResult, CommandSpec } from "./types";

const temporary: string[] = [];
const originalEnvironment = { ...process.env };

function rootFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "silkscribe-preflight-"));
  temporary.push(root);
  for (const file of [
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.adhoc.conf.json",
    "src-tauri/tauri.distribution.conf.json",
    "src-tauri/resources/models/silero_vad_v4.onnx",
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "{}");
  }
  fs.mkdirSync(path.join(root, "node_modules"));
  return root;
}

const ok = (stdout = ""): CommandResult => ({
  exitCode: 0,
  stdout,
  stderr: "",
});

afterEach(() => {
  temporary
    .splice(0)
    .forEach((item) => fs.rmSync(item, { recursive: true, force: true }));
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, originalEnvironment);
});

describe("preflight", () => {
  test("ad hoc builds do not require distribution credentials", async () => {
    const root = rootFixture();
    const plan = createBuildPlan({
      root,
      command: "build",
      platform: "macos",
      mode: "adhoc",
      arch: "aarch64",
      version: "1.0.0",
    });
    const probe = async (spec: CommandSpec) => {
      if (spec.command === "rustup") return ok("aarch64-apple-darwin\n");
      return ok("/usr/bin/tool\n");
    };
    const result = await runPreflight(plan, root, probe);
    expect(preflightPassed(result)).toBe(true);
    expect(result.checks.some((check) => check.name === "Developer ID")).toBe(
      false,
    );
  });

  test("reports missing model", async () => {
    const root = rootFixture();
    fs.rmSync(path.join(root, "src-tauri/resources/models/silero_vad_v4.onnx"));
    const plan = createBuildPlan({
      root,
      command: "doctor",
      platform: "linux",
      mode: "adhoc",
      arch: "host",
      hostArch: "x64",
      version: "1.0.0",
      bundles: [],
    });
    const result = await runPreflight(plan, root, async () =>
      ok("x86_64-unknown-linux-gnu\n"),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: "VAD model", status: "failed" }),
    );
  });

  test("requires updater and notarization credentials for macOS distribution", async () => {
    const root = rootFixture();
    const plan = createBuildPlan({
      root,
      command: "doctor",
      platform: "macos",
      mode: "distribution",
      arch: "aarch64",
      version: "1.0.0",
    });
    const probe = async (spec: CommandSpec) => {
      if (spec.command === "rustup") return ok("aarch64-apple-darwin\n");
      if (spec.command === "security") return ok("");
      return ok("/usr/bin/tool\n");
    };
    const result = await runPreflight(plan, root, probe);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: "updater signing key",
        status: "failed",
      }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: "Developer ID", status: "failed" }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: "APPLE_API_KEY", status: "failed" }),
    );
  });

  test("requires explicit selection when multiple Developer IDs exist", async () => {
    const root = rootFixture();
    process.env.TAURI_SIGNING_PRIVATE_KEY = "secret";
    process.env.APPLE_API_ISSUER = "issuer";
    process.env.APPLE_API_KEY = "key";
    process.env.APPLE_API_KEY_PATH = path.join(root, "AuthKey.p8");
    fs.writeFileSync(process.env.APPLE_API_KEY_PATH, "private");
    const plan = createBuildPlan({
      root,
      command: "doctor",
      platform: "macos",
      mode: "distribution",
      arch: "aarch64",
      version: "1.0.0",
    });
    const identities =
      '  1) AAA "Developer ID Application: One (TEAM1)"\n' +
      '  2) BBB "Developer ID Application: Two (TEAM2)"\n';
    const result = await runPreflight(plan, root, async (spec) => {
      if (spec.command === "rustup") return ok("aarch64-apple-darwin\n");
      if (spec.command === "security") return ok(identities);
      return ok("/usr/bin/tool\n");
    });
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: "Developer ID",
        status: "failed",
        message: expect.stringContaining("Multiple"),
      }),
    );
  });
});
