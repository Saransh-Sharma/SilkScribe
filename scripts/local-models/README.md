# Local transcription workspace

The app uses two isolated, bundled workers. Speech uses pyannote.audio 4 and
Qwen ASR with Transformers 4; notes use MLX with Transformers 5. Do not combine
these environments. No Python installation is required on the user's machine.

## Build the runtime

On Apple Silicon with Python 3.13:

```sh
bun run local:runtime
```

Dependencies are hash-locked in `src-tauri/workers/requirements-*-macos-arm64.lock`.
Pass `--resolve` to the packaging script only when intentionally updating them.
The script creates relocatable PyInstaller bundles in
`src-tauri/resources/local-runtime/`, signs nested binaries inside-out, and runs
a packaged import check. These large artifacts are ignored by Git but included
by Tauri's existing `resources/**/*` packaging rule. Rebuild them when worker.py
changes. Before a release, package each worker with `--identity "Developer ID
Application: …"`; the default ad-hoc signature is development-only. Then sign
and notarize the containing app using the existing release workflow.

Do not advertise the complete runtime on Intel, Windows, Linux, or the Mac App
Store until the corresponding package and sandbox checks pass. Existing native
dictation and native file transcription are retained.

## Publish Community-1

The official weights are gated. There is no HF login or token field in the app.
A publisher with approved access runs:

```sh
.build/local-runtime-speech/venv/bin/python scripts/local-models/prepare-community.py .build/community-1
python3 scripts/local-models/manifest.py directory .build/community-1 community-1 \
  --base-url https://YOUR-DOWNLOAD-SERVER/community-1/PINNED-REVISION \
  --revision PINNED-REVISION --license CC-BY-4.0 \
  --name 'pyannote Community-1' --purpose speakers \
  --output .build/community-1-manifest.json
```

Upload the complete directory, preserving relative paths, then replace the
`community-1` entry in `src-tauri/resources/local-models.json` with this generated
manifest. The snapshot contains the segmentation, embedding, and pipeline
configuration; do not upload just one checkpoint. Preserve the model's license
and attribution. Validate offline pipeline loading before publishing.

Other entries already pin anonymously accessible HF model artifacts and hashes.
The MLX note weights are community conversions, and require accuracy validation
against the upstream weights before quality claims. Memory figures in the
catalog are conservative setup guidance, not benchmark results.

## Verify

```sh
bun run test:workspace-worker
CMAKE_POLICY_VERSION_MINIMUM=3.5 cargo test --manifest-path src-tauri/Cargo.toml --lib
bun run build
bun run lint
bunx playwright test
python3 scripts/local-models/smoke.py --task notes --download
python3 scripts/local-models/smoke.py --task transcribe --audio /absolute/fixture.wav --download
```

Smoke tests run the packaged executable under a macOS sandbox that denies all
network access. They download only when `--download` is explicitly supplied,
verify every artifact, and keep outputs in `.build/`.

## Storage and recovery

New tables live in the existing history database without changing the history
manager's migration version. Legacy dictations are indexed idempotently and
removed from the workspace when legacy retention removes them. Original text is
preserved. New meetings/files have independent explicit deletion.

Imports retain a managed source and normalize to 16 kHz mono incrementally.
Recordings keep microphone and computer tracks until explicit audio deletion;
interrupted captures can be recovered from those tracks. Audio deletion removes
all managed originals, normalized files, recovery tracks, and temporaries. It
never deletes the user's original imported file.

Jobs persist stage boundaries; interrupted jobs require explicit retry. Notes
failures preserve transcripts. Cancellation terminates the worker process and
leaves successful prior stages intact. Edits use revision checks, preserve timing
and original words, and mark notes stale. Renaming is per recording only.

## Remaining release acceptance checks

Community-1 requires the publisher bundle above. Test real microphone/system
capture, permission revocation, device removal, sleep, and loudspeaker echo on
hardware. Apple's voice processing is enabled for microphone capture, but echo
quality has not been certified. Validate multi-hour recordings, full-precision
versus quantized accuracy, supported-language word error and diarization error,
peak memory, and Developer ID notarized clean-machine startup. New workspace
copy currently uses English fallback in other locales; existing translated UI
remains available.

## Current validation (Apple Silicon development build)

80 Rust tests and 29 Playwright journeys passed, along with frontend build,
lint and translation-key checks. The packaged Qwen ASR + forced aligner
transcribed a synthetic English fixture with network access denied. The
packaged Qwen3.5-9B MLX worker generated valid evidence-linked notes under the
same network restriction. This proves startup and basic inference, not meeting
accuracy, quantization parity, or multi-hour performance. The 27B and Community-1
artifacts have not been inference-benchmarked here.

Native and external inference share a lock and unload the native model before
worker stages. Qwen transcription now releases the worker and inference lock
between 120-second cores (with two seconds of overlap). Queued dictation gets
priority before the next worker starts. Waiting for the lock is cancellable.
Atomic checkpoints resume completed Qwen and native ASR chunks after a
restart, keyed to the model and language. Native jobs freeze the selected model
before processing so changing dictation settings does not mix models. A worker
must finish its current chunk before yielding. Notes checkpoint and
unload between each generation/consolidation step; diarization still holds the
lock for its whole stage. Notes checkpoints include the transcript, speaker
names, and installed model revision, so edits invalidate stale work. Memory
guidance is not yet a measured recommendation.

For a development app without updater credentials:

```sh
CMAKE_POLICY_VERSION_MINIMUM=3.5 bunx tauri build --debug --bundles app --no-sign --config '{"bundle":{"createUpdaterArtifacts":false}}'
```
