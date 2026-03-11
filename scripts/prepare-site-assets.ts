import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const bannerSource = resolve(ROOT, "Banner.png");
const iconSource = resolve(ROOT, "Menu Bar Icon.png");
const publicDir = resolve(ROOT, "site/public");
const screenshotSource = resolve(ROOT, "site/src/assets");

const ensurePublicDir = async () => {
  await mkdir(publicDir, { recursive: true });
  await mkdir(resolve(publicDir, "screenshots"), { recursive: true });
};

const build = async () => {
  await ensurePublicDir();

  await sharp(bannerSource)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(resolve(publicDir, "og-image.webp"));

  await cp(bannerSource, resolve(publicDir, "banner.png"));
  await cp(iconSource, resolve(publicDir, "menu-bar-icon.png"));

  await sharp(iconSource)
    .resize(32, 32)
    .png()
    .toFile(resolve(publicDir, "favicon-32.png"));

  await sharp(iconSource)
    .resize(180, 180)
    .png()
    .toFile(resolve(publicDir, "apple-touch-icon.png"));

  await cp(
    resolve(screenshotSource, "onboarding-welcome.webp"),
    resolve(publicDir, "screenshots/onboarding-welcome.webp"),
  );
};

void build();
