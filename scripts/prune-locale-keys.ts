/**
 * Remove stale translations after the English copy changes.
 *
 * Compares src/i18n/locales/en/translation.json against the same file at a git
 * ref (default: HEAD). Every key whose English text changed, or that was
 * deleted, is removed from all other locales so it falls back to the new
 * English until it is translated again. Unchanged keys keep their translations.
 *
 * Usage: bun scripts/prune-locale-keys.ts [git-ref] [--dry-run]
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type TranslationData = { [key: string]: string | TranslationData };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const LOCALES_DIR = path.join(REPO_ROOT, "src", "i18n", "locales");
const REFERENCE_FILE = "src/i18n/locales/en/translation.json";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ref = args.find((arg) => !arg.startsWith("--")) ?? "HEAD";

function flatten(obj: TranslationData, prefix: string[] = []) {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = [...prefix, key];
    if (typeof value === "string") {
      out.set(keyPath.join("\u0000"), value);
    } else {
      for (const [nested, text] of flatten(value, keyPath)) {
        out.set(nested, text);
      }
    }
  }
  return out;
}

/** Deletes a key path and any parent objects it leaves empty. */
function removeKeyPath(obj: TranslationData, keyPath: string[]): boolean {
  const [head, ...rest] = keyPath;
  if (!(head in obj)) return false;
  if (rest.length === 0) {
    delete obj[head];
    return true;
  }
  const child = obj[head];
  if (typeof child === "string") return false;
  const removed = removeKeyPath(child, rest);
  if (removed && Object.keys(child).length === 0) delete obj[head];
  return removed;
}

const previous = flatten(
  JSON.parse(
    execFileSync("git", ["show", `${ref}:${REFERENCE_FILE}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }),
  ),
);
const current = flatten(
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, REFERENCE_FILE), "utf8")),
);

const staleKeys = [...previous.keys()].filter(
  (key) => current.get(key) !== previous.get(key),
);
console.log(
  `${staleKeys.length} English keys changed or were removed since ${ref}.`,
);

const languages = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "en")
  .map((entry) => entry.name)
  .sort();

for (const lang of languages) {
  const filePath = path.join(LOCALES_DIR, lang, "translation.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as TranslationData;
  let removed = 0;
  for (const key of staleKeys) {
    // A changed plural form makes the whole family stale, including forms
    // English doesn't have (e.g. Russian `_few`).
    const base = key.match(/^(.*)_(zero|one|two|few|many|other)$/)?.[1];
    const family =
      base === undefined
        ? [key]
        : ["zero", "one", "two", "few", "many", "other"].map(
            (form) => `${base}_${form}`,
          );
    for (const member of family) {
      if (removeKeyPath(data, member.split("\u0000"))) removed += 1;
    }
  }
  // Keys that no longer exist in English at all are always extra, except
  // plural forms English doesn't use (e.g. `_few` in Russian).
  for (const key of flatten(data).keys()) {
    const pluralBase = key.match(/^(.*)_(zero|one|two|few|many|other)$/)?.[1];
    const isPluralForm =
      pluralBase !== undefined && current.has(`${pluralBase}_other`);
    if (
      !current.has(key) &&
      !isPluralForm &&
      removeKeyPath(data, key.split("\u0000"))
    ) {
      removed += 1;
    }
  }
  if (!dryRun) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  }
  console.log(`${lang}: removed ${removed} keys${dryRun ? " (dry run)" : ""}`);
}
