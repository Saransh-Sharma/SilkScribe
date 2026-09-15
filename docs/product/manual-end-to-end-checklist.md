# Manual end-to-end handoff checklist — working draft

Updated 15 September 2026. This is the handoff checklist being prepared for completion of the plan. It is not a declaration that implementation or release acceptance is complete. See [implementation status](workspace-implementation-status.md) for remaining software work and unverified behavior. Commands run from the repository root unless stated otherwise.

## 1. Publisher action required: Community-1

The application must not ask its users for a Hugging Face account. Only the publisher needs approved access to the official gated repository.

- Accept the model's terms using the publisher's HF account. Supply a read token to the publisher process through `HF_TOKEN` or an existing HF login. Do not put credentials in a manifest, app resource, command transcript, or download URL.
- Download the complete snapshot with the publisher script:

```sh
.build/local-runtime-speech/venv/bin/python scripts/local-models/prepare-community.py .build/community-1
```

- Read `.build/community-1/SOURCE.txt` and use its resolved revision below. Keep the entire directory, including configuration, dependent weights, license and attribution. Use an immutable directory on your server; do not overwrite a published revision.

```sh
python3 scripts/local-models/manifest.py directory .build/community-1 community-1 \
  --base-url https://YOUR-DOWNLOAD-SERVER/community-1/PINNED-REVISION \
  --revision PINNED-REVISION --license CC-BY-4.0 \
  --name 'pyannote Community-1' --purpose speakers \
  --output .build/community-1-manifest.json
```

- Upload the complete model directory preserving paths. Make the artifact URLs anonymously readable over HTTPS, without expiring tokens. Publish the generated manifest or supply its contents and URL for catalog integration.
- Repository integration replaces the `community-1` entry in `src-tauri/resources/local-models.json` with the generated manifest. This can be completed by the implementation agent after the URL is supplied; it is not an end-user setup action.

Expected result: a fresh machine without HF credentials can download every artifact and match every size/SHA-256 hash. The app's Speaker labels pack is installable. Until this step is done, Community-1 is not available end to end.

## 2. Build/release owner: credentials and packaging

End users need neither Python nor development tools. These are publisher/build-machine steps.

- Have Rust, Bun, Xcode command-line tools, Python 3.13 and a Developer ID Application identity available on the Apple Silicon build machine.
- Package both workers using the same Developer ID team as the containing application. The packaging script installs hash-locked dependencies and signs nested binaries. Rebuild when worker code or dependencies change.

```sh
python3.13 scripts/local-models/package-runtime.py --kind speech --identity 'Developer ID Application: YOUR NAME (TEAM_ID)'
python3.13 scripts/local-models/package-runtime.py --kind notes --identity 'Developer ID Application: YOUR NAME (TEAM_ID)'
```

- For public distribution, provide `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`, and the existing updater signing key configuration (`TAURI_SIGNING_PRIVATE_KEY`, plus its password if encrypted). Keep secrets in your local environment or CI secret store. The current distribution CLI checks App Store Connect API credentials for notarization.

```sh
bun run app:build -- doctor --mode distribution --arch aarch64
bun run app:build -- build --mode distribution --arch aarch64 --bundles app,dmg
```

Expected result: the app, each nested worker, notarization/stapling, Gatekeeper acceptance and updater signatures pass verification. The CLI writes runtime verification reports with artifacts. A locally signed debug app is not proof of notarization. Do not declare universal/Intel, Windows, Linux or Mac App Store premium-runtime support based on this Apple Silicon package.

## 3. Product setup on a clean Mac

- Install the actual signed/notarized distribution on a Mac without Python, HF login or developer dependencies.
- In Models & language, install the desired speech pack and Speaker labels. In Local AI notes, explicitly choose and install the 9B or 27B pack appropriate to the machine's memory. Never infer that an installed large model fits every transcript or memory-pressure condition.
- Import audio first with microphone and accessibility permissions denied. File imports must still work. Confirm WAV, MP3, M4A, FLAC and OGG playback in the native application.
- For meeting recording, choose the microphone and computer-audio source. Grant microphone/system-recording access when the app requests it; follow any macOS request to restart capture or the app. Accessibility permission is needed for applicable dictation integration, not file imports.
- Record a short consented conversation with at least two speakers, including overlap. Test pause/resume and Stop & transcribe. Review exclusive transcript speaker assignments and retained overlapping turns, then generate local notes.

Expected result: the transcript remains usable even if optional speaker or notes processing fails. Jobs show progress and recoverable failures. Owners/dates unsupported by the conversation remain blank. Changing transcript text marks notes outdated while saved citation excerpts remain unchanged.

## 4. Local/offline verification and hardware acceptance

These checks require real audio/devices and review. They cannot be certified by browser fixtures.

- After model installation, block networking and repeat import, recording, transcription, speakers, notes, playback and export. Restart the app while offline and repeat. Include the complete pipeline, not only worker startup.
- The developer smoke commands run packaged inference with networking denied; `--download` explicitly permits the preceding verified artifact download. Omit it to require already cached, hash-verified files. Use annotated audio you have permission to process.

```sh
python3 scripts/local-models/smoke.py --task transcribe --audio /absolute/meeting.wav --download
python3 scripts/local-models/smoke.py --task diarize --audio /absolute/meeting.wav --download
python3 scripts/local-models/smoke.py --task notes --notes-model qwen3.5-9b --step --download
python3 scripts/local-models/smoke.py --task notes --notes-model qwen3.6-27b --step --download
```

Expected result: valid protocol output and a saved `.build/*-smoke-result.json`. Diarization includes both `turns` and `exclusive`. Empty output can be valid for silence; only annotated speech establishes speaker performance. The built-in notes smoke is a tiny English example and does not validate meeting factuality.

- Test microphone unplug/replug, output-device changes, permission denial/revocation, sleep/wake, near-full disk, interrupted import/recording, worker crashes, cancellation and app restart. Use a disposable test account/storage volume for fault testing. Verify saved media is recoverable and retry does not duplicate documents.
- Test headphones and loudspeaker echo, overlapping voices, mixed languages, accents, silence and multi-hour meetings. Review transcripts, timestamps, recording-wide identities and source-supported notes against annotations. Follow [evaluation instructions](../../scripts/local-models/EVALUATION.md), including full-precision/quantized and CPU/acceleration comparisons on identical input.
- Edit text, rename/merge/reassign speakers, create notes, replace one generated notes section, search, close/reopen and restart. Verify edits persist and stale-note status is correct. Export TXT, Markdown, SRT, VTT and JSON; inspect them in independent consumers.
- Delete only audio and verify transcript/notes remain. Delete a transcript and verify it is removed. Confirm existing saved dictations survive migration and retention behavior remains specific to dictation.
- Review VoiceOver, keyboard-only navigation, 200% zoom, both themes, reduced motion and Arabic RTL. Have native speakers review translated copy.

## 5. Release acceptance

Record results against the exact app build, model hashes/revisions, worker fingerprints, hardware, OS and test corpus. Fix failed acceptance cases before release. Accuracy, factuality, memory bounds and clean-machine behavior must not be inferred from tiny smoke tests or signature success.

Required before claiming the complete plan is finished: close remaining software items in the implementation status, integrate and verify the real Community-1 bundle, complete the hardware/offline/quality matrix, and verify distribution packaging. Optional product-scope expansions such as live captions, bots, calendar integration, video imports and hosted inference are not part of this checklist.
