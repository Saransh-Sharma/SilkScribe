import fs from "node:fs";
import path from "node:path";
import type {
  BuildPlan,
  CheckResult,
  CommandResult,
  CommandSpec,
  PreflightResult,
} from "./types";
import { runCommand } from "./runner";

type Probe = (
  spec: CommandSpec,
  options?: { allowFailure?: boolean },
) => Promise<CommandResult>;

function passed(name: string, message: string): CheckResult {
  return { name, status: "passed", message };
}

function failed(name: string, message: string, helpTopic: string): CheckResult {
  return { name, status: "failed", message, helpTopic };
}

async function commandExists(
  command: string,
  root: string,
  probe: Probe,
): Promise<boolean> {
  const result = await probe(
    {
      command: process.platform === "win32" ? "where" : "sh",
      args:
        process.platform === "win32"
          ? [command]
          : ["-c", `command -v ${command}`],
      cwd: root,
    },
    { allowFailure: true },
  );
  return result.exitCode === 0;
}

export async function runPreflight(
  plan: BuildPlan,
  root: string,
  probe: Probe = (spec, options) => runCommand(spec, options),
): Promise<PreflightResult> {
  const checks: CheckResult[] = [];
  const requiredFiles = [
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/tauri.conf.json",
    path.relative(root, plan.configPath),
  ];
  for (const file of requiredFiles) {
    checks.push(
      fs.existsSync(path.join(root, file))
        ? passed(file, "found")
        : failed(file, "missing", "troubleshooting"),
    );
  }

  checks.push(
    fs.existsSync(path.join(root, "node_modules"))
      ? passed("dependencies", "node_modules found")
      : failed("dependencies", "Run bun install.", "troubleshooting"),
  );
  const model = path.join(
    root,
    "src-tauri/resources/models/silero_vad_v4.onnx",
  );
  checks.push(
    fs.existsSync(model)
      ? passed("VAD model", "silero_vad_v4.onnx found")
      : failed(
          "VAD model",
          "Required silero_vad_v4.onnx is missing.",
          "troubleshooting",
        ),
  );

  for (const command of ["bun", "rustc", "cargo"]) {
    checks.push(
      (await commandExists(command, root, probe))
        ? passed(command, "available")
        : failed(command, "not found in PATH", "troubleshooting"),
    );
  }

  const rustupAvailable = await commandExists("rustup", root, probe);
  if (rustupAvailable) {
    const targets = await probe(
      {
        command: "rustup",
        args: ["target", "list", "--installed"],
        cwd: root,
      },
      { allowFailure: true },
    );
    const needed =
      plan.target === "universal-apple-darwin"
        ? ["aarch64-apple-darwin", "x86_64-apple-darwin"]
        : [plan.target];
    const missing = needed.filter(
      (target) => !targets.stdout.split(/\s+/u).includes(target),
    );
    checks.push(
      missing.length
        ? failed(
            "Rust target",
            `Install: rustup target add ${missing.join(" ")}`,
            plan.platform,
          )
        : passed("Rust target", needed.join(", ")),
    );
  } else {
    checks.push({
      name: "Rust target",
      status: "warning",
      message: "rustup not available; target installation could not be checked",
    });
  }

  let writableRoot = plan.outputRoot;
  while (!fs.existsSync(writableRoot)) {
    const parent = path.dirname(writableRoot);
    if (parent === writableRoot) break;
    writableRoot = parent;
  }
  try {
    fs.accessSync(writableRoot, fs.constants.W_OK);
    checks.push(
      passed("artifact output", `${plan.outputRoot} (parent writable)`),
    );
  } catch {
    checks.push(
      failed(
        "artifact output",
        `${plan.outputRoot} is not writable`,
        "artifacts",
      ),
    );
  }

  if (plan.platform === "macos") {
    for (const command of ["codesign", "xcrun", "spctl"]) {
      checks.push(
        (await commandExists(command, root, probe))
          ? passed(command, "available")
          : failed(command, "not found", "macos"),
      );
    }
  }

  if (plan.platform === "linux") {
    const tools: Partial<Record<string, string>> = {
      appimage: "patchelf",
      deb: "dpkg-deb",
      rpm: "rpmbuild",
    };
    for (const bundle of plan.bundles) {
      const command = tools[bundle];
      if (!command) continue;
      checks.push(
        (await commandExists(command, root, probe))
          ? passed(command, `available for ${bundle}`)
          : failed(command, `required for ${bundle}`, "linux"),
      );
    }
  }

  const environment: Record<string, string> = {};
  if (plan.mode === "distribution") {
    const updaterKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
    checks.push(
      updaterKey
        ? passed("updater signing key", "configured")
        : failed(
            "updater signing key",
            "TAURI_SIGNING_PRIVATE_KEY is missing.",
            "updater-signing",
          ),
    );

    if (plan.platform === "macos") {
      const identities = await probe(
        {
          command: "security",
          args: ["find-identity", "-v", "-p", "codesigning"],
          cwd: root,
        },
        { allowFailure: true },
      );
      const available = identities.stdout
        .split("\n")
        .map((line) => line.match(/"(Developer ID Application:[^"]+)"/u)?.[1])
        .filter((identity): identity is string => Boolean(identity));
      const configured = process.env.APPLE_SIGNING_IDENTITY;
      if (configured) {
        environment.APPLE_SIGNING_IDENTITY = configured;
        checks.push(
          available.includes(configured)
            ? passed("Developer ID", "configured identity found")
            : failed(
                "Developer ID",
                "APPLE_SIGNING_IDENTITY is not installed.",
                "macos-signing",
              ),
        );
      } else if (available.length === 1) {
        environment.APPLE_SIGNING_IDENTITY = available[0];
        checks.push(passed("Developer ID", "one identity selected"));
      } else {
        checks.push(
          failed(
            "Developer ID",
            available.length === 0
              ? "No Developer ID Application identity found."
              : "Multiple identities found; set APPLE_SIGNING_IDENTITY.",
            "macos-signing",
          ),
        );
      }
      for (const name of [
        "APPLE_API_ISSUER",
        "APPLE_API_KEY",
        "APPLE_API_KEY_PATH",
      ]) {
        const value = process.env[name];
        let ok = Boolean(value);
        if (name === "APPLE_API_KEY_PATH" && value) ok = fs.existsSync(value);
        checks.push(
          ok
            ? passed(name, "configured")
            : failed(
                name,
                `${name} is missing or invalid.`,
                "macos-notarization",
              ),
        );
      }
      const notary = await probe(
        { command: "xcrun", args: ["notarytool", "--version"], cwd: root },
        { allowFailure: true },
      );
      checks.push(
        notary.exitCode === 0
          ? passed("notarytool", "available")
          : failed(
              "notarytool",
              "not available through xcrun",
              "macos-notarization",
            ),
      );
    }

    if (plan.platform === "windows") {
      checks.push(
        (await commandExists("trusted-signing-cli", root, probe))
          ? passed("trusted-signing-cli", "available")
          : failed(
              "trusted-signing-cli",
              "not found in PATH",
              "windows-signing",
            ),
      );
      const azureEnv = [
        "AZURE_CLIENT_ID",
        "AZURE_CLIENT_SECRET",
        "AZURE_TENANT_ID",
      ].every((name) => process.env[name]);
      let azureCli = false;
      if (!azureEnv && (await commandExists("az", root, probe))) {
        const account = await probe(
          { command: "az", args: ["account", "show"], cwd: root },
          { allowFailure: true },
        );
        azureCli = account.exitCode === 0;
      }
      checks.push(
        azureEnv || azureCli
          ? passed(
              "Azure authentication",
              azureEnv ? "environment" : "Azure CLI",
            )
          : failed(
              "Azure authentication",
              "Configure Azure service principal variables or run az login.",
              "windows-signing",
            ),
      );
    }
  }

  return { checks, environment };
}

export function preflightPassed(result: PreflightResult): boolean {
  return result.checks.every((check) => check.status !== "failed");
}
