# Implementation status

Updated 15 September 2026. See the [current implementation matrix](../../docs/product/workspace-implementation-status.md) for completed features and remaining acceptance work.

## Executed checks

- 108 Rust tests pass, including all five native audio decoders, interrupted recordings, durable import batches/receipts and drafts, original-text exports, note review, fallback language capabilities and memory observation invalidation.
- 65 Playwright journeys pass, including five real audio playback containers, managed-draft recovery, batch recovery, bulk speaker corrections, section replacement, export previews, Arabic RTL and a four-hour transcript fixture.
- Frontend build, lint and strict translation checks pass. Seven worker tests, four draft/save-queue/progress tests, five evaluation tests and a runtime-fingerprint test pass.
- The isolated 6,000-turn editor fixture measured 26 ms p95 over 12 edits; this is browser rendering latency, not native storage or multi-hour audio processing performance.
- Packaged Qwen ASR/aligner, Qwen3.5-9B and Qwen3.6-27B notes have passed basic inference with networking denied. The signed 27B worker also passes. These are tiny English smoke fixtures, not quality benchmarks.
- Both workers were signed with Developer ID and passed dependency import checks. Runtime manifests fingerprint all dependency files and invalidate old memory observations when the runtime changes.
- The final Developer ID app builds and passes outer deep/strict signature verification. Packaging corrects Python aliases that Tauri otherwise copies with invalid framework-bound signatures. App-contained notes verification passes: 89 nested signatures, 3,567 manifest records and dependency startup under network denial. App-contained speech verification also passes: 545 signatures, 7,088 manifest records and startup under network denial. Both inventories contain exactly the declared files.
- The separate build-tool suite reports 27 passes and two command-runner output tests failing under Bun's test runner. The same runner succeeds in a standalone probe; this discrepancy remains unresolved and is not counted as a passing release check.
- Notarization was skipped because the build environment lacks a configured app-specific password or App Store Connect API credentials. Signing identity is available; signing and notarization are separate checks.

Model settings now perform real packaged dependency checks with a 240-second process timeout, serialized inference admission and success caching by runtime fingerprint. Catalog rendering is independent of the check. A failed check reports its error; missing binaries retain the setup guidance. Checks are deferred until model settings are opened. The new browser journey covers failure and continued navigation.

## Remaining

Community-1 needs the owner's complete published offline bundle. Annotated meeting benchmarks, quantization/acceleration parity, real hardware capture fault tests, VoiceOver, native webview codec validation, clean-machine offline launch and preserved cross-platform functionality remain acceptance gates. Remaining software items are listed in the implementation matrix; the full goal is not complete.

Use [evaluation instructions](EVALUATION.md) to score saved local predictions without conflating valid source references with factual support.

Distribution verification now automatically gates shipped worker directories on full manifest/signature verification and offline dependency startup, using the outer app’s Developer ID team. Seven artifact-verification tests pass, including incomplete-worker directory coverage. The two separate command-runner tests remain unresolved; changing process APIs did not fix the descriptor failure and that experiment was removed.

Subtitle acceptance passes with ffprobe for SRT and VTT, including overlapping cues and hour-long offsets. Progress events now include version, stage and transcript revision; the frontend rejects stale/invalid updates and regressive within-stage percentages.

Draft staging coalesces superseded pending snapshots while preserving staging-before-commit order. Slow-storage tests exercise 100 rapid edits. Qwen speech and local notes checkpoints now include the packaged runtime fingerprint, so upgrades cannot mix worker/dependency versions within a resumed job. The workspace browser suite passes all 28 journeys after the draft change.

Capture finalization/recovery and import runtime preflight are now hardened as described in the implementation matrix.

Import cancellation now propagates into dependency-check worker execution and cancellable health-cache admission, instead of merely preventing the subsequent copy. A lock-contention regression test confirms cancellation completes without waiting for the existing health check.

Home now surfaces a separate Needs attention group for failed/interrupted jobs and completed transcripts with optional-stage failures. It uses a dedicated Library query and filter, so recovery work does not depend on the recent-transcript page. Cancelled jobs remain available in Library without automatically demanding attention. Backend filter coverage and the Home-to-filtered-Library journey pass.

Settings now has six primary workflow groups. Advanced output/transcription and experimental controls are embedded under Dictation; startup/overlay under Appearance; runtime acceleration/unloading under Models & language; and support under Storage & privacy. Processing/debug panels remain conditional disclosures. The 65-journey suite and a new six-group navigation test pass.

The 15 September signed debug app was rebuilt with consolidated Settings, Home attention items and saved note evidence. Strict outer signature verification passes; embedded speech (545 signatures / 7,088 records) and notes (89 signatures / 3,567 records) pass hash/signature verification and network-denied dependency startup. This build remains unnotarized. Latest executed checks: 110 Rust tests, 67 browser journeys, four frontend units, seven worker tests, seven artifact verification tests and two smoke preparation tests pass. The separately documented command-runner test failures are not represented as resolved.
