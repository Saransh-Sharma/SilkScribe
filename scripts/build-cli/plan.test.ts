import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createBuildPlan, defaultBundles } from "./plan";

const root = "/repo";

describe("build plan", () => {
  test("uses native default bundles", () => {
    expect(defaultBundles("macos")).toEqual(["app", "dmg"]);
    expect(defaultBundles("windows")).toEqual(["nsis", "msi"]);
    expect(defaultBundles("linux")).toEqual(["appimage", "deb", "rpm"]);
  });

  test("constructs a universal distribution command", () => {
    const plan = createBuildPlan({
      root,
      command: "rebuild",
      platform: "macos",
      mode: "distribution",
      arch: "universal",
      version: "1.2.3",
      bundles: ["app", "dmg"],
    });

    expect(plan.target).toBe("universal-apple-darwin");
    expect(plan.updaterArtifacts).toBe(true);
    expect(plan.targetDirectory).toBe(
      path.join(root, "src-tauri/target/universal-apple-darwin"),
    );
    expect(plan.tauriArgs).toEqual([
      "run",
      "tauri",
      "build",
      "--target",
      "universal-apple-darwin",
      "--bundles",
      "app,dmg",
      "--config",
      path.join(root, "src-tauri/tauri.distribution.conf.json"),
      "--ci",
    ]);
  });

  test("disables updater artifacts for ad hoc builds", () => {
    const plan = createBuildPlan({
      root,
      command: "build",
      platform: "windows",
      mode: "adhoc",
      arch: "host",
      hostArch: "x64",
      version: "1.0.0",
    });
    expect(plan.target).toBe("x86_64-pc-windows-msvc");
    expect(plan.updaterArtifacts).toBe(false);
  });

  test("rejects bundles from another platform", () => {
    expect(() =>
      createBuildPlan({
        root,
        command: "build",
        platform: "linux",
        mode: "adhoc",
        arch: "host",
        hostArch: "x64",
        version: "1.0.0",
        bundles: ["dmg"],
      }),
    ).toThrow("cannot be built on linux");
  });

  test("rejects non-host architectures outside macOS", () => {
    expect(() =>
      createBuildPlan({
        root,
        command: "build",
        platform: "windows",
        mode: "adhoc",
        arch: "aarch64",
        hostArch: "x64",
        version: "1.0.0",
      }),
    ).toThrow("support only the host architecture");
  });
});
