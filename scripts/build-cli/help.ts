export const HELP_TOPICS = [
  "commands",
  "examples",
  "modes",
  "artifacts",
  "credentials",
  "macos",
  "macos-signing",
  "macos-notarization",
  "windows",
  "windows-signing",
  "linux",
  "updater-signing",
  "troubleshooting",
  "exit-codes",
] as const;

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

const header = `SilkScribe Build CLI

Build, clean, diagnose, sign, notarize, verify, and collect native Tauri apps.
The CLI builds only the current operating system. Run it natively on each OS.`;

const general = `${header}

USAGE
  bun run app:build
  bun run app:build -- <command> [options]
  bun run app:build -- help <topic>

COMMANDS
  build       Incremental release build
  rebuild     Clean generated outputs, then build
  clean       Remove generated outputs only
  doctor      Check toolchain, resources, packaging, and credentials
  help        Show detailed documentation

OPTIONS
  --mode <adhoc|distribution>  Signing/updater mode (default: adhoc)
  --arch <host|aarch64|x86_64|universal>
                               Target architecture (default: host)
  --bundles <list>             Comma-separated native bundle formats
  --output <directory>         Artifact root (default: artifacts)
  -y, --yes                    Skip the final confirmation
  --open / --no-open           Open artifact directory after success
  -v, --verbose                Show child-process output
  --dry-run                    Check and print work without changing files
  -h, --help                   Show help
  -V, --version                Show the app version

MODES
  macOS adhoc          Ad hoc signed; no notarization/updater signature
  macOS distribution  Developer ID signed, notarized, stapled, updater signed
  Windows adhoc        Unsigned installers
  Windows distribution Azure Trusted Signed, updater signed
  Linux adhoc          Unsigned packages
  Linux distribution   OS-unsigned packages, updater signed

EXAMPLES
  bun run app:build
  bun run app:build -- build --mode adhoc --yes
  bun run app:build -- rebuild --arch universal --bundles app,dmg
  bun run app:build -- doctor --mode distribution
  bun run app:build -- clean --dry-run --yes

EXIT CODES
  0 success  1 build/check failure  2 invalid usage  130 cancelled

HELP TOPICS
  ${HELP_TOPICS.join(", ")}
`;

const topics: Record<(typeof HELP_TOPICS)[number], string> = {
  commands: `${header}

COMMAND REFERENCE
  build     Runs preflight, Tauri build, verification, and artifact collection.
  rebuild   Runs the same flow after guarded cleanup.
  clean     Removes dist, the selected target output, and matching artifacts.
  doctor    Runs preflight only. Add --mode distribution for signing checks.
  help      Shows this reference or a topic.

Interactive prompts are used only on a TTY. In scripts, provide command, mode,
architecture, and bundles explicitly. Use --yes to suppress confirmation.

Examples:
  bun run app:build -- build --mode adhoc --arch host --bundles app,dmg --yes
  bun run app:build -- doctor --mode distribution --arch universal`,
  examples: `${header}

COMMON EXAMPLES
  # Interactive wizard
  bun run app:build

  # macOS local test build
  bun run app:build -- rebuild --mode adhoc --bundles app,dmg --yes

  # macOS public distribution
  bun run app:build -- build --mode distribution --arch universal --bundles app,dmg

  # Windows signed installers
  bun run app:build -- build --mode distribution --bundles nsis,msi

  # Linux packages
  bun run app:build -- build --mode adhoc --bundles appimage,deb,rpm

  # Validate without changing files
  bun run app:build -- rebuild --mode adhoc --dry-run --yes`,
  modes: `${header}

BUILD MODES
  adhoc
    Credential-light local build. macOS uses ad hoc signing. Windows and Linux
    remain unsigned. Tauri updater artifacts are disabled.

  distribution
    Public distribution build. macOS requires Developer ID and notarization.
    Windows requires Azure Trusted Signing. Linux remains OS-unsigned.
    Every platform requires the Tauri updater private key.

Native bundles:
  macOS: app,dmg  Windows: nsis,msi  Linux: appimage,deb,rpm`,
  artifacts: `${header}

ARTIFACTS
  Default directory:
    artifacts/<version>/<platform>/<architecture>/<mode>/

The directory contains installers/app bundles, updater files when enabled,
build.log, and manifest.json. The manifest records SHA-256 hashes, Git commit,
dirty state, selected bundles, and verification results.

Use --output <directory> to choose another artifact root. Existing matching
artifacts are replaced only by rebuild or after build output is collected.`,
  credentials: `${header}

CREDENTIAL SUMMARY
  macOS distribution:
    APPLE_SIGNING_IDENTITY (optional when exactly one identity is installed)
    APPLE_API_ISSUER
    APPLE_API_KEY
    APPLE_API_KEY_PATH
    TAURI_SIGNING_PRIVATE_KEY
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD (optional)

  Windows distribution:
    AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
    or an authenticated Azure CLI session
    TAURI_SIGNING_PRIVATE_KEY
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD (optional)

  Linux distribution:
    TAURI_SIGNING_PRIVATE_KEY
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD (optional)

The CLI never prints, stores, or writes secret values.`,
  macos: `${header}

MACOS BUILDS
  Architectures: host, aarch64, x86_64, universal
  Bundles: app, dmg

Universal builds require:
  rustup target add aarch64-apple-darwin x86_64-apple-darwin

Ad hoc builds require Xcode Command Line Tools and use signing identity "-".
Distribution builds additionally require Developer ID and notarization setup.

See:
  bun run app:build -- help macos-signing
  bun run app:build -- help macos-notarization`,
  "macos-signing": `${header}

MACOS DEVELOPER ID SIGNING
  Install a valid "Developer ID Application" certificate in Keychain.
  List identities:
    security find-identity -v -p codesigning

If more than one Developer ID identity exists, set:
    export APPLE_SIGNING_IDENTITY="Developer ID Application: Name (TEAMID)"

Validate setup:
    bun run app:build -- doctor --mode distribution

Ad hoc mode does not require a Developer ID certificate.`,
  "macos-notarization": `${header}

MACOS NOTARIZATION
  Create an App Store Connect API key and set:
    export APPLE_API_ISSUER="<issuer UUID>"
    export APPLE_API_KEY="<key ID>"
    export APPLE_API_KEY_PATH="$HOME/private_keys/AuthKey_<key ID>.p8"

The key file must exist and be readable. Distribution builds submit to Apple,
wait for notarization, staple the app and DMG, then validate with Gatekeeper.

Check notarytool:
    xcrun notarytool --version`,
  windows: `${header}

WINDOWS BUILDS
  Bundles: nsis, msi
  Architecture: host only in v1

Install Visual Studio Build Tools with Desktop development with C++, WebView2,
and the packaging requirements documented by Tauri.

Ad hoc installers are unsigned. Distribution installers use the configured
Azure Trusted Signing endpoint, account, and certificate profile.`,
  "windows-signing": `${header}

WINDOWS AZURE TRUSTED SIGNING
  Install trusted-signing-cli and configure Azure authentication with:
    AZURE_CLIENT_ID
    AZURE_CLIENT_SECRET
    AZURE_TENANT_ID

Alternatively, install Azure CLI and run:
    az login
    az account show

The checked-in signing command uses the SilkScribe Azure endpoint, account,
certificate profile, and description. Run doctor before an expensive build:
    bun run app:build -- doctor --mode distribution`,
  linux: `${header}

LINUX BUILDS
  Bundles: appimage, deb, rpm
  Architecture: host only in v1

Install the Tauri prerequisites from BUILD.md, including GTK, WebKitGTK,
libappindicator, librsvg, ALSA, Vulkan, gtk-layer-shell, patchelf, and cmake.

Package utilities:
  appimage: patchelf
  deb: dpkg-deb
  rpm: rpmbuild

Linux packages are not OS-signed. Distribution mode signs updater archives.`,
  "updater-signing": `${header}

TAURI UPDATER SIGNING
  Distribution mode requires:
    TAURI_SIGNING_PRIVATE_KEY
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD (only when the key is encrypted)

The private key may be key contents or a path supported by Tauri. Generate a
new pair only if you intend to update the public key in tauri.conf.json:
    bun run tauri signer generate --write-keys ~/.tauri/silkscribe.key

The configured updater public key must match the private key.`,
  troubleshooting: `${header}

TROUBLESHOOTING
  Missing VAD model:
    mkdir -p src-tauri/resources/models
    curl -o src-tauri/resources/models/silero_vad_v4.onnx \\
      https://blob.silkscribe.app/silero_vad_v4.onnx

  Missing Rust target:
    rustup target add <target>

  macOS CMake compatibility:
    CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run app:build -- build ...

  Signing/notarization:
    bun run app:build -- help credentials

  Inspect the retained build.log in the artifact directory after failures.
  Re-run with --verbose to stream full child-process output.`,
  "exit-codes": `${header}

EXIT CODES
  0    Command completed successfully.
  1    Preflight, cleanup, build, verification, or collection failed.
  2    Invalid command line or missing non-interactive arguments.
  130  User cancelled with Ctrl+C.

Failures identify their phase and include a relevant help command when known.`,
};

export function renderHelp(topic?: string): string {
  if (!topic) return general;
  if (topic in topics) {
    return topics[topic as keyof typeof topics];
  }
  const suggestion = [...HELP_TOPICS].sort(
    (a, b) => editDistance(topic, a) - editDistance(topic, b),
  )[0];
  return `Unknown help topic "${topic}". Did you mean "${suggestion}"?\n\n${general}`;
}
