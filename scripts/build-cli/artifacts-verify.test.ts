import { afterEach, describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyArtifacts, discoverArtifacts, writeManifest } from "./artifacts";
import { createBuildPlan } from "./plan";
import { redact } from "./runner";
import { verificationCommands } from "./verify";

const temporary: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "silkscribe-artifact-"));
  temporary.push(root);
  const plan = createBuildPlan({
    root,
    command: "build",
    platform: "macos",
    mode: "adhoc",
    arch: "aarch64",
    version: "1.2.3",
  });
  return { root, plan };
}

afterEach(() => {
  temporary
    .splice(0)
    .forEach((item) => fs.rmSync(item, { recursive: true, force: true }));
});

describe("artifacts and verification", () => {
  test("discovers, copies, and hashes expected bundles", () => {
    const { plan } = fixture();
    const app = path.join(
      plan.targetDirectory,
      "release/bundle/macos/SilkScribe.app",
    );
    const dmg = path.join(
      plan.targetDirectory,
      "release/bundle/dmg/SilkScribe_1.2.3_aarch64.dmg",
    );
    fs.mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
    fs.writeFileSync(path.join(app, "Contents/MacOS/SilkScribe"), "binary");
    fs.mkdirSync(path.dirname(dmg), { recursive: true });
    fs.writeFileSync(dmg, "dmg-data");
    const intermediate = path.join(
      plan.targetDirectory,
      "release/bundle/macos/rw.123.SilkScribe_1.2.3_aarch64.dmg",
    );
    fs.writeFileSync(intermediate, "writable-image");
    fs.mkdirSync(plan.artifactDirectory, { recursive: true });
    fs.writeFileSync(path.join(plan.artifactDirectory, "stale.pkg"), "stale");
    fs.writeFileSync(path.join(plan.artifactDirectory, "build.log"), "log");

    const found = discoverArtifacts(plan);
    const copied = copyArtifacts(plan, found);
    expect(copied.map((item) => item.name)).toEqual([
      "SilkScribe_1.2.3_aarch64.dmg",
      "SilkScribe.app",
    ]);
    expect(copied.find((item) => item.name.endsWith(".dmg"))?.sha256).toBe(
      crypto.createHash("sha256").update("dmg-data").digest("hex"),
    );
    expect(copied.find((item) => item.name.endsWith(".dmg"))?.kind).toBe("dmg");
    expect(fs.existsSync(path.join(plan.artifactDirectory, "stale.pkg"))).toBe(
      false,
    );
    expect(
      fs.readFileSync(path.join(plan.artifactDirectory, "build.log"), "utf8"),
    ).toBe("log");
  });

  test("fails when an expected bundle is missing", () => {
    const { plan } = fixture();
    expect(() => discoverArtifacts(plan)).toThrow("Expected app bundle");
  });

  test("requires updater archives and signatures for distribution", () => {
    const { root } = fixture();
    const plan = createBuildPlan({
      root,
      command: "build",
      platform: "macos",
      mode: "distribution",
      arch: "aarch64",
      version: "1.2.3",
      bundles: ["app"],
    });
    const app = path.join(
      plan.targetDirectory,
      "release/bundle/macos/SilkScribe.app",
    );
    fs.mkdirSync(path.join(app, "Contents"), { recursive: true });
    expect(() => discoverArtifacts(plan)).toThrow("updater signature");

    const archive = path.join(
      plan.targetDirectory,
      "release/bundle/macos/SilkScribe.app.tar.gz",
    );
    fs.writeFileSync(archive, "archive");
    fs.writeFileSync(`${archive}.sig`, "signature");
    expect(discoverArtifacts(plan)).toContain(`${archive}.sig`);
  });

  test("constructs strict distribution verification", () => {
    const { root } = fixture();
    const plan = createBuildPlan({
      root,
      command: "build",
      platform: "macos",
      mode: "distribution",
      arch: "aarch64",
      version: "1.2.3",
    });
    const commands = verificationCommands(
      plan,
      ["/tmp/SilkScribe.app", "/tmp/SilkScribe.dmg"],
      root,
    );
    expect(commands.map((item) => item.name)).toEqual([
      "macOS code signature",
      "macOS app stapling",
      "Gatekeeper assessment",
      "macOS DMG stapling",
    ]);
    expect(commands[0].spec.args).toContain("--strict");
  });

  test("redacts named and raw secret values", () => {
    process.env.AZURE_CLIENT_SECRET = "highly-secret";
    expect(
      redact("AZURE_CLIENT_SECRET=highly-secret output contains highly-secret"),
    ).not.toContain("highly-secret");
    delete process.env.AZURE_CLIENT_SECRET;
  });

  test("writes manifest metadata", async () => {
    const { root, plan } = fixture();
    fs.mkdirSync(plan.artifactDirectory, { recursive: true });
    const manifest = await writeManifest(
      plan,
      root,
      "2026-01-01T00:00:00.000Z",
      [],
      [{ check: "test", status: "passed" }],
    );
    expect(manifest.schemaVersion).toBe(1);
    expect(
      fs.existsSync(path.join(plan.artifactDirectory, "manifest.json")),
    ).toBe(true);
  });
});
