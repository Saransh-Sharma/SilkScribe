import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertSafeCleanPath, cleanPaths } from "./clean";

const temporary: string[] = [];

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "silkscribe-clean-"));
  temporary.push(root);
  return root;
}

afterEach(() => {
  temporary
    .splice(0)
    .forEach((item) => fs.rmSync(item, { recursive: true, force: true }));
});

describe("guarded cleanup", () => {
  test("dry-run removes nothing", () => {
    const root = fixture();
    const dist = path.join(root, "dist");
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, "file"), "data");
    cleanPaths([dist], root, path.join(root, "artifacts"), true);
    expect(fs.existsSync(dist)).toBe(true);
  });

  test("removes approved generated paths", () => {
    const root = fixture();
    const target = path.join(root, "src-tauri/target/triple");
    fs.mkdirSync(target, { recursive: true });
    cleanPaths([target], root, path.join(root, "artifacts"), false);
    expect(fs.existsSync(target)).toBe(false);
  });

  test("rejects repository root and outside paths", () => {
    const root = fixture();
    expect(() =>
      assertSafeCleanPath(root, root, path.join(root, "artifacts")),
    ).toThrow("unsafe path");
    expect(() =>
      assertSafeCleanPath(os.tmpdir(), root, path.join(root, "artifacts")),
    ).toThrow("unsafe path");
  });

  test("rejects symlinks", () => {
    const root = fixture();
    const real = path.join(root, "real");
    const link = path.join(root, "dist");
    fs.mkdirSync(real);
    fs.symlinkSync(real, link);
    expect(() =>
      assertSafeCleanPath(link, root, path.join(root, "artifacts")),
    ).toThrow("symlink");
  });
});
