# SilkScribe presentation overhaul

> Historical note: this documents the July 14 presentation pass. The current design direction and release plan are defined in [`ui-ux-overhaul-execution-plan.md`](./ui-ux-overhaul-execution-plan.md).

## Intent

SilkScribe now presents itself as a warm native transcription instrument: compact, calm, status-led, keyboard-friendly, and precise. The visual language uses an ivory/forest/berry/gold palette, restrained depth, a single application scroller, and motion only where it communicates response or continuity.

This work is presentation-only. Tauri commands and events, Rust behavior, settings keys and defaults, generated bindings, persistence formats, onboarding completion rules, model selection rules, history behavior, platform conditions, and native window geometry remain unchanged.

## Surface and state inventory

| Surface           | Reachable states covered                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Application shell | light, dark, RTL, sidebar selection, conditional Debug, narrow desktop composition, 200% zoom, keyboard focus                              |
| Home              | permissions blocked, model missing, shortcut missing, ready, compact metrics, recent history                                               |
| General           | shortcut, push-to-talk, microphone, mute, feedback, output, volume, language, theme, dependent controls                                    |
| Models            | active, installed, available, downloading, extracting, switching, custom, unavailable, error, retry, cancel, delete                        |
| Advanced / Debug  | conditional experiments, disclosures, selectable paths, technical settings                                                                 |
| Post Processing   | disabled/enabled, providers, Apple Intelligence, custom URL, masked secret, model discovery/creation, prompt CRUD                          |
| History           | search, filters, export menu, folder action, grouped rows, audio, copied, retrying, loading, empty, error, pagination                      |
| Permission repair | missing permission, reason, system action, live detection, retry, onboarding and repair continuation                                       |
| Onboarding        | welcome, microphone, accessibility, model resolving/downloading/extracting/activating/ready/error, practice lifecycle, persistence failure |
| Recording overlay | recording, transcribing, processing, success, error, cancelled, GPU waveform, CSS fallback, reduced motion                                 |
| Shared overlays   | dropdown collision, keyboard selection, Escape/outside click, focus restoration, dialog focus trap, toast layers                           |

## Visual and interaction decisions

- The previous floating website card and footer band were replaced with a full-window 240px navigation rail and one content scroller.
- Content uses 20–24px gutters, compact page headers, deliberate 1180×820 recomposition, stable scrollbar behavior, and logical properties for RTL.
- Model switching, updater/version, and support utilities live in the quiet sidebar footer.
- Borders define most hierarchy. Shadows have four semantic levels and are reserved for actual elevation such as menus and dialogs.
- All ordinary-screen ambient washes were removed. The restrained onboarding atmosphere retains a static speech-line motif.
- Berry is the unmistakable selection/action color; forest communicates readiness; gold communicates recording energy; red is reserved for failure/destructive state.
- Press response is 90ms, hover/menu response is 140–180ms, page/state continuity is 180–240ms, and onboarding/overlay morphs stay within 240–300ms. Reduced motion collapses these to 1ms or a short opacity change.
- Dense rows do not stagger, float, or change geometry for transient feedback.
- The recording overlay remains 300×84 in production, transparent, non-activating, always-on-top, event-compatible, and backed by the existing Pixi WebGPU/WebGL renderer with CSS fallback.

## Implementation progress

- [x] Semantic typography, spacing, optical radii, elevation, focus, state, layer, and motion tokens
- [x] Native full-window shell, navigation, and integrated sidebar utilities
- [x] Normalized settings rows, groups, buttons, dropdowns, disclosures, dialogs, and focus behavior
- [x] Operational readiness Home surface and compact metrics/history continuation
- [x] Settings, Models, Advanced, Debug, Post Processing, and History recomposition
- [x] Sequential permission repair and compact progress-rail onboarding
- [x] Stable model setup instrument and practice rehearsal presentation
- [x] Interruptible recording overlay state morphs and accessible visible labels
- [x] Deterministic presentation fixtures without production store/API changes
- [x] Playwright discovery restricted to `*.spec.ts`
- [x] Focused interaction, RTL, reduced-motion, model-state, history, onboarding, and overlay tests

## Baseline and capture evidence

- Baseline frontend build, lint, translation validation, formatting, focused Bun onboarding tests, and `cargo check` passed before edits. Vite emitted the existing large-chunk advisory only.
- The pre-edit Playwright run failed during discovery because Node attempted to import `bun:test` from `tests/onboardingModel.test.ts`. `testMatch` now limits Playwright to `*.spec.ts`.
- The real Tauri app launched successfully before edits and initialized the Metal transcription backend.
- macOS denied command-line screen capture because the host process did not have Screen & System Audio Recording permission. Browser fixtures are therefore the repeatable visual substitute for baseline and changed-state comparison; this limitation does not affect application permission handling.
- Presentation fixtures intentionally contain no API keys, custom-provider secrets, user transcript data, or persisted settings.

## Risks and safeguards

- Browser fixtures cannot validate the native transparent overlay against every physical desktop wallpaper. The overlay is tested over deterministic light and dark backdrops; a signed/native manual pass remains the final release check.
- WebGPU availability varies by machine. The existing renderer retains WebGL and CSS fallback behavior, and hidden rendering remains dormant.
- The full English catalog is loaded only by the fixture entry. Production localization continues to use the existing 17 locale catalogs with no schema or key changes.
- No new framework, animation dependency, shader, binding generation, or backend surface was introduced.

## Release verification checklist

- Build, lint, translation parity, Playwright, focused Bun onboarding tests, formatting, and Rust checks
- Light/dark, RTL, reduced motion, keyboard-only navigation, viewport collision, focus restoration, and 200% zoom
- Native sizing, startup theme, permission repair, shortcut formatting, dialogs, transparent overlay placement, GPU/fallback rendering, and paste feedback
- Model progress values, downloaded/total size, speed, ETA, cancellation/retry, history action names, and stable transient feedback geometry

Exact command results and any environment substitutions are recorded in the delivery summary for the implementation run.

## Implementation-run verification

Completed on 2026-07-14:

- `bun run build`: passed; the existing Vite chunk-size advisory remains unchanged.
- `bun run lint`: passed.
- `bun run check:translations`: passed for the English reference and all 16 translated catalogs (693 keys).
- `bun run test:playwright`: 24 passed. In the Codex host, Bun temporarily prepends a Bun-as-Node shim; the run set `NODE=/opt/homebrew/bin/node` so Playwright used its supported Node runtime. The repository command and config remain portable.
- `bun test tests/onboardingModel.test.ts`: 6 passed.
- `bun run format:check`: passed, including `cargo fmt --check`.
- `cargo check`: passed with Homebrew CMake on `PATH` and `CMAKE_POLICY_VERSION_MINIMUM=3.5`, matching the repository prerequisite note.
- `git diff --check`: passed.
- Browser screenshots were inspected for system light/dark at 1360×920; Home and model download at 1180×820; onboarding at 1180×640; and processing overlay at 420×160 over a dark backdrop.
