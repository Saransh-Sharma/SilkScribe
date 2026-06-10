# SilkScribe Build CLI

The build CLI provides one native workflow for cleaning, diagnosing, building,
signing, notarizing, verifying, and collecting SilkScribe desktop artifacts.
It builds only the current operating system. Run it on macOS, Windows, or Linux
to produce that platform's packages.

## Quick Start

Launch the interactive wizard:

```bash
bun run app:build
```

Run deterministic commands for scripts or CI:

```bash
bun run app:build -- build --mode adhoc --arch host --bundles app,dmg --yes
bun run app:build -- rebuild --mode distribution --arch universal
bun run app:build -- clean --mode adhoc --dry-run --yes
bun run app:build -- doctor --mode distribution
```

Use the built-in documentation for the complete command reference:

```bash
bun run app:build -- --help
bun run app:build -- help examples
bun run app:build -- help troubleshooting
```

## Commands

| Command   | Behavior                                                        |
| --------- | --------------------------------------------------------------- |
| `build`   | Incremental release build, verification, and collection         |
| `rebuild` | Guarded cleanup followed by a build                             |
| `clean`   | Remove generated frontend, selected target, and artifact output |
| `doctor`  | Validate tools, resources, packaging utilities, and credentials |
| `help`    | Show general or topic-specific documentation                    |

Shared options:

```text
--mode adhoc|distribution
--arch host|aarch64|x86_64|universal
--bundles <comma-separated-list>
--output <directory>
--yes
--open / --no-open
--verbose
--dry-run
--help
--version
```

Missing choices are prompted when running in a terminal. Fully specified
commands are suitable for automation. `--dry-run` runs planning and preflight
and prints all cleanup paths and commands without changing files.

## Platform Matrix

| Host    | Ad hoc                                  | Distribution                                            |
| ------- | --------------------------------------- | ------------------------------------------------------- |
| macOS   | Ad hoc signed `app` and `dmg`           | Developer ID signed, notarized, and stapled             |
| Windows | Unsigned `nsis` and `msi` installers    | Azure Trusted Signed installers                         |
| Linux   | Unsigned `appimage`, `deb`, `rpm` files | OS-unsigned packages with signed Tauri updater archives |

Distribution mode enables Tauri updater artifacts and requires
`TAURI_SIGNING_PRIVATE_KEY`. The optional
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is used for encrypted keys.

macOS supports Apple Silicon, Intel, and universal builds. Universal builds
require both targets:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

Windows and Linux currently build the host architecture only.

## macOS Distribution

Install a valid Developer ID Application certificate and verify it:

```bash
security find-identity -v -p codesigning
```

When multiple identities are installed, choose one:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Name (TEAMID)"
```

Configure App Store Connect API notarization:

```bash
export APPLE_API_ISSUER="<issuer UUID>"
export APPLE_API_KEY="<key ID>"
export APPLE_API_KEY_PATH="$HOME/private_keys/AuthKey_<key ID>.p8"
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/silkscribe.key"
```

Validate and build:

```bash
bun run app:build -- doctor --mode distribution --arch universal
bun run app:build -- rebuild --mode distribution --arch universal --bundles app,dmg
```

The CLI validates the app and DMG with `codesign`, `xcrun stapler`, and `spctl`.

## Windows Distribution

Install `trusted-signing-cli` and authenticate through an Azure service
principal:

```powershell
$env:AZURE_CLIENT_ID = "<client ID>"
$env:AZURE_CLIENT_SECRET = "<client secret>"
$env:AZURE_TENANT_ID = "<tenant ID>"
$env:TAURI_SIGNING_PRIVATE_KEY = "C:\secure\silkscribe.key"
```

An authenticated Azure CLI session from `az login` is also accepted. The Tauri
distribution overlay preserves SilkScribe's checked-in Azure endpoint, account,
certificate profile, and description.

```powershell
bun run app:build -- doctor --mode distribution
bun run app:build -- build --mode distribution --bundles nsis,msi
```

Generated installers must report a valid Authenticode signature.

## Linux Builds

Install the native prerequisites in [BUILD.md](../BUILD.md). The CLI checks the
selected package utilities:

- AppImage: `patchelf`
- Debian: `dpkg-deb`
- RPM: `rpmbuild`

```bash
bun run app:build -- doctor --mode adhoc
bun run app:build -- rebuild --mode adhoc --bundles appimage,deb,rpm
```

Linux packages are not OS-signed. Distribution mode signs only Tauri updater
archives.

## Cleanup Safety

`clean` and `rebuild` can remove only:

- `dist/`
- The selected `src-tauri/target/<target>/`
- The matching artifact directory

The CLI rejects the repository root, outside paths, and symlinks. It does not
remove `.build/`, models, dependencies, Bun caches, Cargo registries, or Rust
toolchains.

## Artifacts

Successful builds are collected under:

```text
artifacts/<version>/<platform>/<architecture>/<mode>/
```

The directory contains the native bundles, updater files when enabled,
`build.log`, and `manifest.json`. The manifest records SHA-256 hashes, the Git
commit and dirty state, build timestamps, selected formats, and verification
results.

Use another output root with:

```bash
bun run app:build -- build --output /path/to/output
```

## Help and Troubleshooting

Available topics:

```text
commands, examples, modes, artifacts, credentials, macos, macos-signing,
macos-notarization, windows, windows-signing, linux, updater-signing,
troubleshooting, exit-codes
```

Examples:

```bash
bun run app:build -- help macos-notarization
bun run app:build -- help windows-signing
bun run app:build -- help updater-signing
```

Exit codes are `0` for success, `1` for build or validation failure, `2` for
invalid usage, and `130` for cancellation. Failed builds retain their
`build.log` and any generated artifacts for diagnosis.
