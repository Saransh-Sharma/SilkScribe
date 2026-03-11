import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "..", "src", "i18n", "locales");
const REFERENCE_LANG = "en";
const STRICT_MISSING_MODE =
  process.argv.includes("--strict-missing") ||
  process.env.STRICT_MISSING_TRANSLATIONS === "1";

type TranslationData = Record<string, unknown>;

interface ValidationResult {
  valid: boolean;
  missing: string[][];
  extra: string[][];
}

function getLanguages(): string[] {
  const entries = fs.readdirSync(LOCALES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== REFERENCE_LANG)
    .map((entry) => entry.name)
    .sort();
}

const LANGUAGES = getLanguages();

const colors: Record<string, string> = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function colorize(text: string, color: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function getAllKeyPaths(
  obj: TranslationData,
  prefix: string[] = [],
): string[][] {
  let paths: string[][] = [];
  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) continue;

    const currentPath = prefix.concat([key]);
    const value = obj[key];

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      paths = paths.concat(
        getAllKeyPaths(value as TranslationData, currentPath),
      );
    } else {
      paths.push(currentPath);
    }
  }
  return paths;
}

function hasKeyPath(obj: TranslationData, keyPath: string[]): boolean {
  let current: unknown = obj;
  for (const key of keyPath) {
    if (
      typeof current !== "object" ||
      current === null ||
      (current as Record<string, unknown>)[key] === undefined
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return true;
}

function loadTranslationFile(lang: string): TranslationData | null {
  const filePath = path.join(LOCALES_DIR, lang, "translation.json");

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) as TranslationData;
  } catch (error) {
    console.error(colorize(`✗ Error loading ${lang}/translation.json:`, "red"));
    console.error(`  ${(error as Error).message}`);
    return null;
  }
}

function validateTranslations(): void {
  console.log(colorize("\n🌍 Translation Consistency Check\n", "blue"));
  console.log(
    `Missing key policy: ${STRICT_MISSING_MODE ? "strict (error)" : "warn-only"}`,
  );

  const referenceData = loadTranslationFile(REFERENCE_LANG);
  if (!referenceData) {
    console.error(
      colorize(`\n✗ Failed to load reference file (${REFERENCE_LANG})`, "red"),
    );
    process.exit(1);
  }

  const referenceKeyPaths = getAllKeyPaths(referenceData);
  console.log(`Reference has ${referenceKeyPaths.length} keys\n`);

  let hasErrors = false;
  let hasWarnings = false;
  const results: Record<string, ValidationResult> = {};

  for (const lang of LANGUAGES) {
    const langData = loadTranslationFile(lang);

    if (!langData) {
      hasErrors = true;
      results[lang] = { valid: false, missing: [], extra: [] };
      continue;
    }

    const missing = referenceKeyPaths.filter(
      (keyPath) => !hasKeyPath(langData, keyPath),
    );
    const langKeyPaths = getAllKeyPaths(langData);
    const extra = langKeyPaths.filter(
      (keyPath) => !hasKeyPath(referenceData, keyPath),
    );

    const missingIsError = STRICT_MISSING_MODE && missing.length > 0;
    const hasValidationError = extra.length > 0 || missingIsError;
    if (hasValidationError) {
      hasErrors = true;
    }
    if (!STRICT_MISSING_MODE && missing.length > 0) {
      hasWarnings = true;
    }

    results[lang] = {
      valid: !hasValidationError,
      missing,
      extra,
    };
  }

  console.log(colorize("Results:", "blue"));
  console.log("─".repeat(60));

  for (const lang of LANGUAGES) {
    const result = results[lang];
    const isWarningOnly =
      !STRICT_MISSING_MODE &&
      result.missing.length > 0 &&
      result.extra.length === 0;

    if (result.valid && !isWarningOnly) {
      console.log(
        colorize(`✓ ${lang.toUpperCase()}: No schema issues`, "green"),
      );
    } else if (isWarningOnly) {
      console.log(
        colorize(
          `⚠ ${lang.toUpperCase()}: Missing keys (runtime fallback will be used)`,
          "yellow",
        ),
      );
    } else {
      console.log(colorize(`✗ ${lang.toUpperCase()}: Issues found`, "red"));
    }

    if (result.missing.length > 0) {
      const label = STRICT_MISSING_MODE
        ? `  Missing ${result.missing.length} keys:`
        : `  Missing ${result.missing.length} keys (warn):`;
      console.log(colorize(label, "yellow"));
      result.missing.slice(0, 10).forEach((keyPath) => {
        console.log(`    - ${keyPath.join(".")}`);
      });
      if (result.missing.length > 10) {
        console.log(
          colorize(`    ... and ${result.missing.length - 10} more`, "yellow"),
        );
      }
    }

    if (result.extra.length > 0) {
      console.log(
        colorize(
          `  Extra ${result.extra.length} keys (not in reference):`,
          "yellow",
        ),
      );
      result.extra.slice(0, 10).forEach((keyPath) => {
        console.log(`    - ${keyPath.join(".")}`);
      });
      if (result.extra.length > 10) {
        console.log(
          colorize(`    ... and ${result.extra.length - 10} more`, "yellow"),
        );
      }
    }

    if (result.missing.length > 0 || result.extra.length > 0) {
      console.log("");
    }
  }

  console.log("─".repeat(60));

  if (hasErrors) {
    console.log(colorize("\n✗ Validation failed", "red"));
    process.exit(1);
  }

  if (hasWarnings) {
    console.log(
      colorize(
        "\n✓ Validation passed with warnings (missing keys use English fallback)",
        "yellow",
      ),
    );
  } else {
    console.log(colorize("\n✓ Validation passed", "green"));
  }

  process.exit(0);
}

validateTranslations();
