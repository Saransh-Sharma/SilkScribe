# Implementation status

## Implemented and exercised

- Home / Library / Settings workspace, persistent creation actions and status.
- Search, source filters, saved state, editable transcript, speaker names/merges,
  playback controls, evidence-linked editable notes, stale notes and exports.
- SQLite migration/indexing of dictation history; durable job stages and retries.
- Native decoder, copied imports, cancellation and managed audio deletion.
- Pinned public model manifests, hashes, resumable downloads and atomic installs.
- Separate packaged speech and MLX runtimes; basic Qwen ASR/aligner and 9B notes
  inference passed with networking denied. Bundled MLX shader layout repaired.
- Qwen and native-ASR atomic recovery checkpoints, with model selection frozen
  for native jobs; Qwen chunk scheduling and dictation priority when
  waiting for the shared inference lock. Current chunk completion is required.

## Implemented, awaiting real-world validation

- ScreenCaptureKit plus microphone recording, meters, pause/resume, tray controls,
  separate recovery tracks and microphone voice processing.
- Community-1 adapter retaining overlapping and exclusive speaker assignments.
- Hierarchical notes for long transcripts and all supported input/export formats.
  Notes now checkpoint after each generation and unload between steps.
- Development app packaging. Developer ID signing/notarization not exercised.

## Remaining implementation

- Yielding during long diarization stages without losing recording-wide
  speaker identity.
- Measured memory recommendations and current-memory-headroom admission.
- Full translations for new workspace strings (English fallback currently works).
- Broader automated import/export, crash, disk exhaustion and recording recovery
  coverage; device-loss/sleep behavior needs hardware verification.

## External release dependencies

- Publish the complete Community-1 bundle and generated server manifest.
- Annotated meeting corpus, multi-hour tests and full-precision/quantized parity
  benchmarks, including accents, overlapping voices and mixed languages.
- Signing credentials and clean-machine installation/notarization verification.

Do not equate successful smoke tests with completed quality benchmarking or
claim the entire original plan is release-ready.

## Latest continuation validation

80 Rust tests, six Python worker tests, all 29 Playwright tests, frontend build,
and lint pass. The updated development macOS bundle builds. Rebuilt packaged
speech inference passes with networking denied, including a fixture beginning
at 120 seconds whose timestamps retain the original recording offset.

The packaged notes worker also passes network-denied step-mode inference.
A six-test worker suite covers checkpoint round trips and one-generation-per-step
hierarchical reduction. Successful jobs discard checkpoints only after the final
document is saved. Multi-hour note factuality remains unbenchmarked.
