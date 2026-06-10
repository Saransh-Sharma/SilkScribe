import path from "node:path";
import type {
  BuildPlan,
  CommandResult,
  CommandSpec,
  VerificationResult,
} from "./types";
import { CliError } from "./types";
import { runCommand } from "./runner";

type Executor = (
  spec: CommandSpec,
  options?: { allowFailure?: boolean },
) => Promise<CommandResult>;

function command(
  executable: string,
  args: string[],
  root: string,
): CommandSpec {
  return { command: executable, args, cwd: root };
}

export function verificationCommands(
  plan: BuildPlan,
  artifacts: string[],
  root: string,
): Array<{ name: string; spec: CommandSpec; expected?: RegExp }> {
  const commands: Array<{
    name: string;
    spec: CommandSpec;
    expected?: RegExp;
  }> = [];
  if (plan.platform === "macos") {
    const app = artifacts.find((file) => file.endsWith(".app"));
    const dmg = artifacts.find((file) => file.endsWith(".dmg"));
    if (app) {
      commands.push({
        name: "macOS code signature",
        spec: command(
          "codesign",
          [
            "--verify",
            ...(plan.mode === "distribution" ? ["--deep", "--strict"] : []),
            "--verbose=2",
            app,
          ],
          root,
        ),
      });
      if (plan.mode === "distribution") {
        commands.push({
          name: "macOS app stapling",
          spec: command("xcrun", ["stapler", "validate", app], root),
        });
        commands.push({
          name: "Gatekeeper assessment",
          spec: command(
            "spctl",
            ["--assess", "--type", "execute", "--verbose=4", app],
            root,
          ),
        });
      }
    }
    if (dmg && plan.mode === "distribution") {
      commands.push({
        name: "macOS DMG stapling",
        spec: command("xcrun", ["stapler", "validate", dmg], root),
      });
    }
  }
  if (plan.platform === "windows") {
    for (const artifact of artifacts.filter((file) =>
      [".exe", ".msi"].includes(path.extname(file).toLowerCase()),
    )) {
      const script = `(Get-AuthenticodeSignature -FilePath '${artifact.replaceAll("'", "''")}').Status`;
      commands.push({
        name: `Authenticode ${path.basename(artifact)}`,
        spec: command("powershell", ["-NoProfile", "-Command", script], root),
        expected:
          plan.mode === "distribution"
            ? /^\s*Valid\s*$/imu
            : /^\s*NotSigned\s*$/imu,
      });
    }
  }
  if (plan.platform === "linux") {
    for (const artifact of artifacts) {
      if (artifact.endsWith(".deb")) {
        commands.push({
          name: `Debian package ${path.basename(artifact)}`,
          spec: command("dpkg-deb", ["--info", artifact], root),
        });
      } else if (artifact.endsWith(".rpm")) {
        commands.push({
          name: `RPM package ${path.basename(artifact)}`,
          spec: command("rpm", ["-qip", artifact], root),
        });
      } else if (artifact.endsWith(".AppImage")) {
        commands.push({
          name: `AppImage ${path.basename(artifact)}`,
          spec: command("file", [artifact], root),
          expected: /executable|AppImage/iu,
        });
      }
    }
  }
  return commands;
}

export async function verifyArtifacts(
  plan: BuildPlan,
  artifacts: string[],
  root: string,
  executor: Executor = (spec, options) => runCommand(spec, options),
): Promise<VerificationResult[]> {
  const commands = verificationCommands(plan, artifacts, root);
  if (!commands.length) {
    return [{ check: "No platform verification required", status: "skipped" }];
  }
  const results: VerificationResult[] = [];
  for (const check of commands) {
    const result = await executor(check.spec, { allowFailure: true });
    const combined = `${result.stdout}\n${result.stderr}`;
    if (
      result.exitCode !== 0 ||
      (check.expected && !check.expected.test(combined))
    ) {
      throw new CliError(
        `Verification failed: ${check.name}`,
        1,
        "troubleshooting",
        "verification",
      );
    }
    results.push({ check: check.name, status: "passed" });
  }
  return results;
}
