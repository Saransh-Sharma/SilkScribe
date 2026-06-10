# macOS Direct Download Release

SilkScribe direct-download releases use the normal Tauri configuration, not the Mac App Store configuration. The release workflow builds a universal macOS DMG, signs it with a Developer ID Application certificate, notarizes and staples the artifacts, and publishes a draft GitHub Release.

## Required GitHub Secrets

- `APPLE_CERTIFICATE`: Base64-encoded `.p12` export of the Developer ID Application certificate.
- `APPLE_CERTIFICATE_PASSWORD`: Password used when exporting the `.p12`.
- `KEYCHAIN_PASSWORD`: Temporary CI keychain password.
- `APPLE_API_ISSUER`: App Store Connect API issuer ID.
- `APPLE_API_KEY`: App Store Connect API key ID.
- `APPLE_API_PRIVATE_KEY`: Contents of the App Store Connect `.p8` private key.
- `TAURI_SIGNING_PRIVATE_KEY`: Tauri updater private key, as content or a path supported by Tauri.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Optional password for the Tauri updater private key.

The updater public key in `src-tauri/tauri.conf.json` must match `TAURI_SIGNING_PRIVATE_KEY`. If the private key for the current public key is unavailable, generate a new Tauri signing key pair and update the public key before publishing the first release from this repository.

## Local Distribution Build

Use the build CLI to validate credentials, create a universal build, notarize
and staple it, verify it with Gatekeeper, and collect the result:

```bash
bun run app:build -- doctor --mode distribution --arch universal
bun run app:build -- rebuild --mode distribution --arch universal --bundles app,dmg
```

Local artifacts are written to:

```text
artifacts/<version>/macos/universal/distribution/
```

See [build-cli.md](build-cli.md) for credential setup, built-in help topics,
dry-run behavior, and troubleshooting.

## GitHub Release Command

Set the same semantic version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, then push a matching tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release macOS` workflow creates a draft release in `Saransh-Sharma/SilkScribe`. Review the uploaded DMG, updater archives, signatures, generated `latest.json`, and release notes before publishing the draft.

## Verification

The workflow validates that the tag matches all app version fields, then verifies the signed app and stapled artifacts with:

```bash
codesign --verify --deep --strict --verbose=2 SilkScribe.app
xcrun stapler validate SilkScribe.app
xcrun stapler validate SilkScribe.dmg
spctl --assess --type execute --verbose=4 SilkScribe.app
```

After publishing, confirm that the updater metadata is downloadable at:

```text
https://github.com/Saransh-Sharma/SilkScribe/releases/latest/download/latest.json
```
