import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ArtifactManifest,
  BuildPlan,
  CollectedArtifact,
  VerificationResult,
} from "./types";
import { CliError } from "./types";
import { runCommand } from "./runner";

const extensions = [
  ".dmg",
  ".msi",
  ".exe",
  ".AppImage",
  ".deb",
  ".rpm",
  ".sig",
  ".tar.gz",
  ".zip",
];

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const output: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app")) output.push(fullPath);
      else output.push(...walk(fullPath));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      output.push(fullPath);
    }
  }
  return output;
}

export function bundleRoot(plan: BuildPlan): string {
  return path.join(plan.targetDirectory, "release", "bundle");
}

export function discoverArtifacts(plan: BuildPlan): string[] {
  const found = walk(bundleRoot(plan));
  const relevant = found.filter((file) => {
    if (/^rw\..*\.dmg$/u.test(path.basename(file))) return false;
    if (file.endsWith(".app")) return plan.bundles.includes("app");
    if (file.endsWith(".dmg")) return plan.bundles.includes("dmg");
    if (file.endsWith(".msi")) return plan.bundles.includes("msi");
    if (file.endsWith(".AppImage")) return plan.bundles.includes("appimage");
    if (file.endsWith(".deb")) return plan.bundles.includes("deb");
    if (file.endsWith(".rpm")) return plan.bundles.includes("rpm");
    if (file.endsWith(".exe")) return plan.bundles.includes("nsis");
    return plan.updaterArtifacts;
  });
  for (const bundle of plan.bundles) {
    const exists = relevant.some((file) => {
      if (bundle === "app") return file.endsWith(".app");
      if (bundle === "dmg") return file.endsWith(".dmg");
      if (bundle === "msi") return file.endsWith(".msi");
      if (bundle === "nsis") return file.endsWith(".exe");
      return file.toLowerCase().endsWith(`.${bundle}`);
    });
    if (!exists) {
      throw new CliError(
        `Expected ${bundle} bundle was not found under ${bundleRoot(plan)}.`,
        1,
        "artifacts",
        "collection",
      );
    }
  }
  if (plan.updaterArtifacts) {
    const signatures = relevant.filter((file) => file.endsWith(".sig"));
    if (!signatures.length) {
      throw new CliError(
        `Distribution build did not produce an updater signature under ${bundleRoot(plan)}.`,
        1,
        "updater-signing",
        "collection",
      );
    }
    const missingArchive = signatures.find(
      (signature) => !fs.existsSync(signature.slice(0, -4)),
    );
    if (missingArchive) {
      throw new CliError(
        `Updater archive is missing for ${path.basename(missingArchive)}.`,
        1,
        "updater-signing",
        "collection",
      );
    }
  }
  return relevant.sort();
}

function hashFile(file: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function hashDirectory(directory: string): string {
  const hash = crypto.createHash("sha256");
  const files = walkAllFiles(directory);
  for (const file of files) {
    hash.update(path.relative(directory, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function walkAllFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkAllFiles(fullPath));
    else files.push(fullPath);
  }
  return files.sort();
}

function directorySize(directory: string): number {
  return walkAllFiles(directory).reduce(
    (total, file) => total + fs.statSync(file).size,
    0,
  );
}

export function copyArtifacts(
  plan: BuildPlan,
  sources: string[],
): CollectedArtifact[] {
  fs.mkdirSync(plan.artifactDirectory, { recursive: true });
  for (const entry of fs.readdirSync(plan.artifactDirectory)) {
    if (entry !== "build.log") {
      fs.rmSync(path.join(plan.artifactDirectory, entry), {
        recursive: true,
        force: true,
      });
    }
  }
  return sources.map((source) => {
    const name = path.basename(source);
    const destination = path.join(plan.artifactDirectory, name);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(source, destination, { recursive: true });
    const directory = fs.statSync(destination).isDirectory();
    return {
      name,
      path: destination,
      size: directory
        ? directorySize(destination)
        : fs.statSync(destination).size,
      sha256: directory ? hashDirectory(destination) : hashFile(destination),
      kind: artifactKind(name),
    };
  });
}

function artifactKind(name: string): string {
  if (name.endsWith(".app")) return "app";
  if (name.endsWith(".app.tar.gz")) return "updater";
  if (name.endsWith(".tar.gz")) return "archive";
  if (name.endsWith(".zip")) return "updater";
  if (name.endsWith(".AppImage")) return "appimage";
  return path.extname(name).slice(1) || "file";
}

export async function writeManifest(
  plan: BuildPlan,
  root: string,
  startedAt: string,
  artifacts: CollectedArtifact[],
  verification: VerificationResult[],
): Promise<ArtifactManifest> {
  const [commit, status] = await Promise.all([
    runCommand(
      { command: "git", args: ["rev-parse", "HEAD"], cwd: root },
      { allowFailure: true },
    ),
    runCommand(
      { command: "git", args: ["status", "--porcelain"], cwd: root },
      { allowFailure: true },
    ),
  ]);
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    appVersion: plan.appVersion,
    platform: plan.platform,
    architecture: plan.architecture,
    mode: plan.mode,
    bundles: plan.bundles,
    git: {
      commit: commit.stdout.trim() || "unknown",
      dirty: Boolean(status.stdout.trim()),
    },
    startedAt,
    completedAt: new Date().toISOString(),
    artifacts,
    verification,
  };
  fs.writeFileSync(
    path.join(plan.artifactDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
