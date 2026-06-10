import fs from "node:fs";
import path from "node:path";
import { CliError } from "./types";

export function assertSafeCleanPath(
  candidate: string,
  root: string,
  outputRoot: string,
): void {
  const resolved = path.resolve(candidate);
  const repoRoot = path.resolve(root);
  const artifacts = path.resolve(outputRoot);
  const insideRepo = resolved.startsWith(`${repoRoot}${path.sep}`);
  const insideArtifacts =
    resolved === artifacts || resolved.startsWith(`${artifacts}${path.sep}`);
  if ((!insideRepo && !insideArtifacts) || resolved === repoRoot) {
    throw new CliError(
      `Refusing to clean unsafe path: ${resolved}`,
      1,
      "troubleshooting",
      "cleanup",
    );
  }
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new CliError(
      `Refusing to clean symlink: ${resolved}`,
      1,
      "troubleshooting",
      "cleanup",
    );
  }
}

export function cleanPaths(
  paths: string[],
  root: string,
  outputRoot: string,
  dryRun: boolean,
): string[] {
  for (const candidate of paths) {
    assertSafeCleanPath(candidate, root, outputRoot);
  }
  if (!dryRun) {
    for (const candidate of paths) {
      fs.rmSync(candidate, { recursive: true, force: true });
    }
  }
  return paths;
}
