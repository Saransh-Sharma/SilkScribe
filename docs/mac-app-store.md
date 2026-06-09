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

## Mac App Store Entitlements

The App Store build declares only:

- `com.apple.security.app-sandbox`
- `com.apple.security.device.microphone`
- `com.apple.security.network.client`

Do not add temporary exception entitlements unless App Review gives a concrete reason to do so.

## App Store Build Differences

- The Tauri updater plugin is not initialized and the frontend update UI is hidden.
- Tauri `macOSPrivateApi` is disabled.
- External script paste mode is disabled.
- The macOS `osascript` mute fallback is disabled.
- The app remains free and full-featured, so there is no StoreKit or in-app purchase setup.

## Local Verification

After building, verify the signed app before upload:

```bash
codesign -dvvv --entitlements - "src-tauri/target/release/bundle/macos/SilkScribe.app"
```

Confirm the output includes `com.apple.security.app-sandbox`, `com.apple.security.device.microphone`, and `com.apple.security.network.client`.

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
