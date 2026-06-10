import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "./args";
import { HELP_TOPICS, renderHelp } from "./help";

describe("arguments", () => {
  test("parses commands and automation flags", () => {
    expect(
      parseCliArgs([
        "rebuild",
        "--mode",
        "distribution",
        "--arch",
        "universal",
        "--bundles",
        "app,dmg",
        "--yes",
        "--no-open",
        "--dry-run",
      ]),
    ).toMatchObject({
      command: "rebuild",
      mode: "distribution",
      arch: "universal",
      bundles: ["app", "dmg"],
      yes: true,
      open: false,
      dryRun: true,
    });
  });

  test("rejects invalid values with usage exit code", () => {
    try {
      parseCliArgs(["build", "--mode", "broken"]);
      throw new Error("expected parse to fail");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(2);
    }
  });

  test("suggests close command names", () => {
    expect(() => parseCliArgs(["rebuld"])).toThrow('Did you mean "rebuild"');
  });
});

describe("help", () => {
  test("renders every topic with examples or actionable commands", () => {
    for (const topic of HELP_TOPICS) {
      const output = renderHelp(topic);
      expect(output).toContain("SilkScribe Build CLI");
      expect(output).toMatch(
        /bun run|COMMAND|EXIT|ARTIFACT|BUILD|SIGN|LINUX|WINDOWS|MACOS/u,
      );
    }
  });

  test("suggests a close topic", () => {
    expect(renderHelp("mac-signin")).toContain('Did you mean "macos-signing"');
  });

  test("plain help contains no ANSI escapes", () => {
    expect(renderHelp()).not.toMatch(/\x1b\[/u);
  });
});
