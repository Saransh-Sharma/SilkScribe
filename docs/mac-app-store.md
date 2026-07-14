# Mac App Store Release

SilkScribe has a separate Mac App Store build path so the direct-download build can keep its updater/private-window behavior while the App Store build stays sandboxed.

## Build Command

```bash
bun install
bun run tauri:build:mas
```

The `tauri:build:mas` script uses:

- `src-tauri/tauri.mas.conf.json`
- `src-tauri/Entitlements.mas.plist`
- Cargo feature `mac-app-store`
- Cargo `--no-default-features`
- `VITE_MAC_APP_STORE=1`
- rustup's toolchain from `~/.cargo/bin`

This command is a local readiness build. App Store Connect requires a signed
`.pkg`, so use the packaging command below for the actual upload artifact.

The first App Store build targets Apple Silicon (`aarch64-apple-darwin`) and
sets the Mac App Store minimum system version to macOS 12.0. A universal build
was attempted, but the current ONNX Runtime dependency path does not provide
prebuilt `x86_64-apple-darwin` binaries for this feature set.

## App Store Package Command

Install or export the following Apple assets before packaging:

- `MAS_PROVISION_PROFILE`: path to the Mac App Store Connect provisioning
  profile for `com.silkscribe.app`
- `MAS_APP_SIGNING_IDENTITY`: Apple Distribution or 3rd Party Mac Developer
  Application identity used to sign `SilkScribe.app`
- `MAS_INSTALLER_SIGNING_IDENTITY`: Mac Installer Distribution or 3rd Party Mac
  Developer Installer identity used by `productbuild`
- `APPLE_API_ISSUER`: App Store Connect issuer ID
- `APPLE_API_KEY_ID` or `APPLE_API_KEY`: App Store Connect API key ID

Build and package without uploading:

```bash
MAS_PROVISION_PROFILE="$HOME/Downloads/SilkScribe_Mac_App_Store.provisionprofile" \
MAS_APP_SIGNING_IDENTITY="Apple Distribution: Saransh Sharma (CJ43UNM3AR)" \
MAS_INSTALLER_SIGNING_IDENTITY="3rd Party Mac Developer Installer: Saransh Sharma (CJ43UNM3AR)" \
bun run tauri:package:mas
```

Build, package, and upload to App Store Connect:

```bash
APPLE_API_ISSUER="<issuer UUID>" \
APPLE_API_KEY_ID="<key ID>" \
MAS_PROVISION_PROFILE="$HOME/Downloads/SilkScribe_Mac_App_Store.provisionprofile" \
MAS_APP_SIGNING_IDENTITY="Apple Distribution: Saransh Sharma (CJ43UNM3AR)" \
MAS_INSTALLER_SIGNING_IDENTITY="3rd Party Mac Developer Installer: Saransh Sharma (CJ43UNM3AR)" \
bun run tauri:upload:mas
```

The API private key must be available to `altool` as
`AuthKey_<key ID>.p8` in one of Apple's supported private key directories, such
as `~/.appstoreconnect/private_keys/`.

The package is written to:

```text
src-tauri/target/mas/SilkScribe_1.0.0_mas.pkg
```

## Mac App Store Entitlements

The App Store build declares only:

- `com.apple.security.app-sandbox`
- `com.apple.application-identifier`
- `com.apple.developer.team-identifier`
- `com.apple.security.device.microphone`
- `com.apple.security.network.client`

Do not add temporary exception entitlements unless App Review gives a concrete reason to do so.

The checked-in entitlements use team ID `CJ43UNM3AR` and bundle ID
`com.silkscribe.app`. If the App Store Connect app is moved to another team,
update `src-tauri/Entitlements.mas.plist` before signing.

## App Store Build Differences

- The Tauri updater plugin is not initialized and the frontend update UI is hidden.
- Tauri `macOSPrivateApi` is disabled.
- External script paste mode is disabled.
- The macOS `osascript` mute fallback is disabled.
- The app remains free and full-featured, so there is no StoreKit or in-app purchase setup.

## Local Verification

After local readiness building, verify the output to catch accidental direct
distribution signing:

```bash
codesign -dvvv --entitlements - "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/SilkScribe.app"
```

Confirm the output includes `com.apple.security.app-sandbox`, `com.apple.security.device.microphone`, and `com.apple.security.network.client`.

After packaging, verify the App Store-signed app:

```bash
APP="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/SilkScribe.app"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dvvv --entitlements - "$APP"
test -f "$APP/Contents/embedded.provisionprofile"
test -f "$APP/Contents/PrivacyInfo.xcprivacy"
plutil -p "$APP/Contents/Info.plist"
```

Confirm the bundle ID is `com.silkscribe.app`, version is `1.0.0`, encryption
is declared with `ITSAppUsesNonExemptEncryption=false`, the app has a sandbox
entitlement, and the package is signed with the installer identity.

Run the App Store build locally and test:

- first launch and onboarding
- microphone permission allowed and denied
- model download
- transcription
- global shortcut recording
- text insertion into another app
- local history
- optional AI post-processing
- app restart

## App Store Connect Notes

Use these review notes as a starting point:

SilkScribe is a desktop speech-to-text utility. Audio is recorded from the microphone and transcribed locally by default. The app asks for Accessibility/Input Monitoring permissions so the user can trigger transcription with a global shortcut and insert the resulting text into the active text field. Model files are downloaded as data files used for local transcription. The App Store build does not include an in-app updater or in-app purchases.

If AI post-processing is enabled by the user, transcript text may be sent to the provider selected by the user for text cleanup. This is optional and controlled by the user in settings.

## App Store Connect Metadata

Use `docs/app-store-metadata.md` for the first-release product page copy,
privacy URL, support URL, keyword list, screenshot plan, and review checklist.
