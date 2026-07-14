import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const srcTauri = resolve(root, "src-tauri");
const upload = process.argv.includes("--upload");
const cargoBin = resolve(process.env.HOME ?? "", ".cargo/bin");

if (process.env.HOME) {
  process.env.PATH = `${cargoBin}:${process.env.PATH ?? ""}`;
}

process.on("uncaughtException", (error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});

if (process.argv.includes("--help")) {
  console.log(`Usage: node scripts/build-mas-package.mjs [--upload]

Required environment:
  MAS_PROVISION_PROFILE           Path to Mac App Store Connect provisioning profile
  MAS_APP_SIGNING_IDENTITY        Apple Distribution app signing identity
  MAS_INSTALLER_SIGNING_IDENTITY  Mac Installer Distribution signing identity

Required only with --upload:
  APPLE_API_ISSUER                App Store Connect issuer UUID
  APPLE_API_KEY_ID or APPLE_API_KEY

Optional environment:
  MAS_TEAM_ID                     Defaults to CJ43UNM3AR
  MAS_BUNDLE_ID                   Defaults to com.silkscribe.app
  MAS_ARCH                        Defaults to aarch64-apple-darwin
`);
  process.exit(0);
}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const optional = (name, fallback = "") => process.env[name]?.trim() || fallback;

const run = (command, args, options = {}) => {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: process.env,
    stdio: "inherit",
  });
};

const capture = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`,
    );
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
};

const profilePath = resolve(required("MAS_PROVISION_PROFILE"));
if (!existsSync(profilePath)) {
  throw new Error(`MAS_PROVISION_PROFILE does not exist: ${profilePath}`);
}

const appIdentity = required("MAS_APP_SIGNING_IDENTITY");
const installerIdentity = required("MAS_INSTALLER_SIGNING_IDENTITY");
const teamId = optional("MAS_TEAM_ID", "CJ43UNM3AR");
const bundleId = optional("MAS_BUNDLE_ID", "com.silkscribe.app");
const appName = optional("MAS_APP_NAME", "SilkScribe");
const arch = optional("MAS_ARCH", "aarch64-apple-darwin");
const version = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
).version;
const targetRoot =
  arch === "universal-apple-darwin"
    ? resolve(srcTauri, "target/universal-apple-darwin/release")
    : resolve(srcTauri, `target/${arch}/release`);
const appPath = resolve(targetRoot, `bundle/macos/${appName}.app`);
const pkgPath = resolve(srcTauri, `target/mas/${appName}_${version}_mas.pkg`);
const generatedConfigPath = resolve(
  srcTauri,
  "target/mas/tauri.mas.generated.conf.json",
);

mkdirSync(dirname(generatedConfigPath), { recursive: true });

const masConfig = JSON.parse(
  readFileSync(resolve(srcTauri, "tauri.mas.conf.json"), "utf8"),
);
masConfig.bundle ??= {};
masConfig.bundle.macOS ??= {};
masConfig.bundle.macOS.signingIdentity = appIdentity;
masConfig.bundle.macOS.files = {
  ...(masConfig.bundle.macOS.files ?? {}),
  "embedded.provisionprofile": profilePath,
  "PrivacyInfo.xcprivacy": resolve(srcTauri, "gen/apple/PrivacyInfo.xcprivacy"),
};

writeFileSync(generatedConfigPath, `${JSON.stringify(masConfig, null, 2)}\n`);

run("bun", [
  "run",
  "tauri",
  "build",
  "--config",
  generatedConfigPath,
  "--target",
  arch,
  "--bundles",
  "app",
  "--",
  "--no-default-features",
  "--features",
  "mac-app-store",
]);

run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);

const entitlements = capture("codesign", [
  "-dvvv",
  "--entitlements",
  "-",
  appPath,
]);
for (const expected of [
  "com.apple.security.app-sandbox",
  "com.apple.security.device.microphone",
  "com.apple.security.network.client",
  "com.apple.application-identifier",
  "com.apple.developer.team-identifier",
]) {
  if (!entitlements.includes(expected)) {
    throw new Error(`Missing entitlement in signed app: ${expected}`);
  }
}

for (const expected of [teamId, `${teamId}.${bundleId}`]) {
  if (!entitlements.includes(expected)) {
    throw new Error(`Missing entitlement value in signed app: ${expected}`);
  }
}

for (const requiredFile of [
  `${appPath}/Contents/embedded.provisionprofile`,
  `${appPath}/Contents/PrivacyInfo.xcprivacy`,
]) {
  if (!existsSync(requiredFile))
    throw new Error(`Missing bundled file: ${requiredFile}`);
}

const infoPlist = capture("plutil", [
  "-extract",
  "CFBundleIdentifier",
  "raw",
  `${appPath}/Contents/Info.plist`,
]);
if (infoPlist.trim() !== bundleId) {
  throw new Error(`Expected bundle id ${bundleId}, found ${infoPlist.trim()}`);
}

rmSync(pkgPath, { force: true });

run("xcrun", [
  "productbuild",
  "--component",
  appPath,
  "/Applications",
  "--sign",
  installerIdentity,
  pkgPath,
]);

if (upload) {
  const apiKey = optional("APPLE_API_KEY_ID", optional("APPLE_API_KEY"));
  const apiIssuer = required("APPLE_API_ISSUER");
  if (!apiKey) throw new Error("APPLE_API_KEY_ID or APPLE_API_KEY is required");
  run("xcrun", [
    "altool",
    "--upload-app",
    "--type",
    "macos",
    "--file",
    pkgPath,
    "--apiKey",
    apiKey,
    "--apiIssuer",
    apiIssuer,
  ]);
}

console.log(`\nMac App Store package ready: ${pkgPath}`);
