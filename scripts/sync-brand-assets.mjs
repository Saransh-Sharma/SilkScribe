import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SOURCE_BANNER = path.join(ROOT, "Banner.png");
const SOURCE_ICON = path.join(ROOT, "Menu Bar Icon.png");

const FRONTEND_ASSETS_DIR = path.join(ROOT, "src", "assets");
const TAURI_RESOURCES_DIR = path.join(ROOT, "src-tauri", "resources");
const TAURI_ICONS_DIR = path.join(ROOT, "src-tauri", "icons");

const BANNER_UI = path.join(FRONTEND_ASSETS_DIR, "banner-ui.webp");
const MENU_BAR_ICON_UI = path.join(FRONTEND_ASSETS_DIR, "menu-bar-icon-ui.webp");

const LEGACY_FRONTEND_ASSETS = [
  path.join(FRONTEND_ASSETS_DIR, "banner.png"),
  path.join(FRONTEND_ASSETS_DIR, "menu-bar-icon.png"),
  path.join(FRONTEND_ASSETS_DIR, "silkscribe-icon.png"),
];

const TRAY_SIZE = 32;
const TRAY_ICON_SIZE = 24;
const TRAY_ICON_OFFSET = 4;
const BADGE_CENTER = 24;
const BADGE_RADIUS = 4.2;

const COLORS = {
  white: "#FFFFFF",
  crimson: "#C11317",
  marigold: "#FEBF2B",
  ochre: "#9E5F0A",
};

async function ensureSourceAssets() {
  await Promise.all([
    fs.access(SOURCE_BANNER),
    fs.access(SOURCE_ICON),
    fs.mkdir(FRONTEND_ASSETS_DIR, { recursive: true }),
    fs.mkdir(TAURI_RESOURCES_DIR, { recursive: true }),
    fs.mkdir(TAURI_ICONS_DIR, { recursive: true }),
  ]);
}

async function generateFrontendAssets() {
  await sharp(SOURCE_BANNER)
    .resize({ width: 960, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 100 })
    .toFile(BANNER_UI);

  await sharp(SOURCE_ICON)
    .resize(256, 256, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .webp({ quality: 84, alphaQuality: 100 })
    .toFile(MENU_BAR_ICON_UI);

  await Promise.all(
    LEGACY_FRONTEND_ASSETS.map((assetPath) =>
      fs.rm(assetPath, { force: true }),
    ),
  );
}

function circleSvg({ fill = "none", stroke = "none", strokeWidth = 0 }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TRAY_SIZE}" height="${TRAY_SIZE}" viewBox="0 0 ${TRAY_SIZE} ${TRAY_SIZE}">
      <circle
        cx="${BADGE_CENTER}"
        cy="${BADGE_CENTER}"
        r="${BADGE_RADIUS}"
        fill="${fill}"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
      />
    </svg>`,
  );
}

function buildBaseIcon({ tint } = {}) {
  let pipeline = sharp(SOURCE_ICON)
    .resize(TRAY_ICON_SIZE, TRAY_ICON_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .ensureAlpha();

  if (tint) {
    pipeline = pipeline.tint(tint);
  }

  return pipeline.png().toBuffer();
}

async function composeTrayIcon({
  baseBuffer,
  overlays = [],
  outputPath,
}) {
  await sharp({
    create: {
      width: TRAY_SIZE,
      height: TRAY_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: baseBuffer,
        left: TRAY_ICON_OFFSET,
        top: TRAY_ICON_OFFSET,
      },
      ...overlays,
    ])
    .png()
    .toFile(outputPath);
}

async function generateTrayIcons() {
  const templateBase = await buildBaseIcon({ tint: COLORS.white });
  const colorBase = await buildBaseIcon();

  const recordingTemplateBadge = circleSvg({ fill: COLORS.white });
  const transcribingTemplateBadge = circleSvg({
    fill: "none",
    stroke: COLORS.white,
    strokeWidth: 2.2,
  });

  const recordingColorBadge = circleSvg({ fill: COLORS.crimson });
  const transcribingColorBadge = circleSvg({
    fill: "none",
    stroke: COLORS.marigold,
    strokeWidth: 2.2,
  });
  const transcribingColorCore = circleSvg({ fill: COLORS.ochre, stroke: "none" });

  const templateTargets = [
    {
      files: ["tray_idle.png", "tray_idle_dark.png"],
      overlays: [],
    },
    {
      files: ["tray_recording.png", "tray_recording_dark.png"],
      overlays: [{ input: recordingTemplateBadge }],
    },
    {
      files: ["tray_transcribing.png", "tray_transcribing_dark.png"],
      overlays: [{ input: transcribingTemplateBadge }],
    },
  ];

  for (const target of templateTargets) {
    for (const fileName of target.files) {
      await composeTrayIcon({
        baseBuffer: templateBase,
        overlays: target.overlays,
        outputPath: path.join(TAURI_RESOURCES_DIR, fileName),
      });
    }
  }

  await composeTrayIcon({
    baseBuffer: colorBase,
    overlays: [],
    outputPath: path.join(TAURI_RESOURCES_DIR, "silkscribe.png"),
  });

  await composeTrayIcon({
    baseBuffer: colorBase,
    overlays: [{ input: recordingColorBadge }],
    outputPath: path.join(TAURI_RESOURCES_DIR, "recording.png"),
  });

  await composeTrayIcon({
    baseBuffer: colorBase,
    overlays: [
      { input: transcribingColorCore, blend: "screen" },
      { input: transcribingColorBadge },
    ],
    outputPath: path.join(TAURI_RESOURCES_DIR, "transcribing.png"),
  });
}

async function generateLogoPng() {
  await sharp(SOURCE_ICON)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .png()
    .toFile(path.join(TAURI_ICONS_DIR, "logo.png"));
}

function regenerateTauriIcons() {
  execFileSync("bun", ["run", "tauri", "icon", "Menu Bar Icon.png"], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

async function main() {
  await ensureSourceAssets();
  await generateFrontendAssets();
  await generateTrayIcons();
  regenerateTauriIcons();
  await generateLogoPng();
}

main().catch((error) => {
  console.error("Failed to sync brand assets:", error);
  process.exitCode = 1;
});
