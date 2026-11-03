# SilkScribe UI/UX overhaul execution plan

## Product thesis

SilkScribe should feel like a private writing companion that disappears into a user's day. The interface is not a technical speech-recognition console. It is a calm place to confirm readiness, understand what just happened, and adjust the few things that matter.

The design concept is **spoken thought becoming silk**. Voice energy gathers, flows, and resolves into text. That sequence becomes the shared visual and motion grammar across onboarding, recording, processing, model setup, and completion states.

### Experience principles

1. **Ready before configurable.** The first surface answers whether dictation will work now. Configuration is secondary.
2. **Private without ceremony.** Local processing and permissions are explained in plain language at the moment they matter.
3. **Expressive at the edges.** Recording, waiting, completion, and first-use moments carry personality. Routine settings remain fast and quiet.
4. **Progressive depth.** Common controls remain visible; technical and experimental controls stay behind clear navigation and disclosure.
5. **Native composure.** Window-scale layouts, keyboard access, focus behavior, RTL, zoom, transparent overlays, and reduced motion are first-class product behavior.

## Visual direction

### Aesthetic

Refined minimalism with tactile warmth. The interface uses warm pearl neutrals, ink typography, and one ruby interaction accent. Gold is not a second action color; it is reserved for voice energy, progress glints, and rare celebratory moments.

### Material hierarchy

- **Canvas:** quiet tinted field with two fixed silk-like ambient forms.
- **Navigation rail:** one persistent translucent material plane.
- **Content:** negative space carries most hierarchy.
- **Elevated surfaces:** settings groups, menus, dialogs, and the voice stage use restrained edge refraction and diffusion shadows only when elevation has meaning.
- **Controls:** slightly denser and more opaque than their parent surface so they remain legible over translucency.

### Typography

- Manrope is bundled locally for predictable rendering and an approachable geometric voice.
- Page titles use tight tracking and compact line height, never oversized marketing typography.
- Labels use small uppercase text only for navigation and state orientation.
- Numbers and shortcut tokens use tabular figures; monospace remains limited to paths, version strings, and genuinely technical values.

### Motion grammar

| Phase   | Meaning                             | Visual behavior                                       | Typical duration |
| ------- | ----------------------------------- | ----------------------------------------------------- | ---------------- |
| Gather  | listening, selection, preparation   | elements contract toward a focal point; rings breathe | 180–360 ms       |
| Flow    | download, transcription, processing | ribbons, bars, or nodes travel continuously           | state-dependent  |
| Resolve | success, copied, ready              | motion converges, checks draw, surfaces settle        | 240–520 ms       |
| Release | cancel, close, dismiss              | scale and opacity recede faster than entry            | 140–240 ms       |

All motion uses transform and opacity wherever possible. Continuous animation is isolated to the fixed atmosphere, home voice bloom, onboarding status instrument, and the existing GPU overlay. `prefers-reduced-motion` removes travel and repetition while keeping state changes legible.

## Information architecture

### Primary navigation

1. **Home** — readiness, shortcut, active model, permissions, lightweight usage, recent dictation.
2. **General** — shortcut, microphone, recording behavior, feedback, language, appearance.
3. **Models** — active local engine, installed engines, available downloads, language capabilities.
4. **Advanced** — retention, clipboard, startup, overlay, post-processing entry points.
5. **Post Processing** — visible only when enabled; provider, credentials, model, prompts.
6. **History** — search, filtering, transcript actions, audio, export, retention.
7. **Debug** — visible only after the existing developer-mode shortcut.

The model selector, update state, version, and support utilities stay in the navigation footer because they describe the application as a whole rather than the active page.

### Onboarding sequence

1. Promise and privacy.
2. Microphone permission.
3. Accessibility permission.
4. Automatic model selection, download, extraction, and activation.
5. A real practice dictation with a skippable completion path.

Permission repair reuses the relevant onboarding steps without replaying the full introduction.

## Surface execution plan

### 1. Shared shell and navigation

- Replace the flat split-pane treatment with a translucent navigation plane over a warm atmospheric canvas.
- Replace cropped raster branding inside product UI with a crisp vector mark and typographic wordmark.
- Add a liquid active-navigation lens with an unmistakable current-page indicator.
- Maintain one application scroller, stable scrollbar geometry, logical properties for RTL, and a working skip link.
- Recompose the rail and content gutters below 820 px without hiding navigation or controls.

**Acceptance:** no horizontal overflow at 200% zoom; current section is perceivable without relying on color; footer menus remain reachable at minimum supported height.

### 2. Shared component system

- Normalize button hierarchy, physical press response, pointer-origin ripple, disabled/loading behavior, and focus rings.
- Standardize setting rows, labels, descriptions, tooltips, dropdowns, selects, inputs, textareas, sliders, toggles, badges, and path displays.
- Give portalled menus and dialogs the same material behavior as in-flow surfaces.
- Keep dialogs for destructive or irreversible decisions only.
- Add deterministic loading, empty, error, and success states for every async surface.

**Acceptance:** keyboard operation and focus restoration work for every menu/dialog; transient feedback does not change row geometry; controls retain 44 px targets.

### 3. Home and activity

- Make readiness the hero information rather than a generic welcome card.
- Introduce the voice bloom as the signature visual: a quiet microphone core, waveform bars, and model caption.
- Surface the global shortcut beside the primary setup action.
- Keep usage statistics subordinate and remove dashboard-like metric emphasis.
- Present recent activity as a readable editorial timeline with secondary actions revealed through interaction.

**Acceptance:** a first-time user can identify the shortcut, model, microphone, and permission state without visiting settings; empty history teaches the next action.

### 4. Models and progress

- Separate the active engine, installed alternatives, and available downloads.
- Adapt the sample repository's circular-download pattern into a compact ring paired with exact bytes, speed, ETA, cancel, retry, extraction, and activation states.
- Use a continuous progress transform rather than remounting controls.
- Keep capability and performance information readable without turning model rows into feature-card grids.

**Acceptance:** all seven model states are visually distinct; actions remain stable while status changes; no progress value renders as `undefined`, negative, or above 100%.

### 5. Onboarding and permission repair

- Turn the shell into a calm full-window material with a compact progress rail.
- Use a clear step title, one plain-language explanation, one primary action, and a concrete system guide.
- Give model preparation a persistent state instrument instead of a spinner-only wait.
- Make practice completion resolve visibly without delaying the actual completion action.

**Acceptance:** actions remain reachable at 1180×640; live permission detection and retry work; completion persistence errors remain recoverable; every step has a reduced-motion presentation.

### 6. Recording overlay

- Preserve the native transparent, non-activating, always-on-top window contract.
- Retune the existing Pixi GPU waveform from forest tones to the ruby/gold product palette.
- Morph one island between recording, transcribing, post-processing, success, error, and cancelled states.
- Display backend preview text when available, while keeping announcements concise and atomic.
- Preserve WebGL and CSS fallback behavior and avoid rendering while hidden.

**Acceptance:** all states announce useful text; the overlay remains legible over light and dark desktops; hidden rendering is dormant; reduced motion removes node travel and pulsing.

### 7. Settings, history, and utilities

- Use consistent section rhythm and row density across General, Advanced, Post Processing, History, About, and Debug.
- Preserve conditional dependencies so enabling a parent reveals children with continuity and disabling it never leaves unusable controls.
- Keep destructive history/model actions secondary until intent is clear.
- Preserve search, filters, audio playback, copy, saved state, retry, export, folder actions, retention, and pagination.

**Acceptance:** all existing Tauri commands, settings keys, store behavior, and translations remain intact; no secret values appear in fixtures or logs.

## Engineering architecture

### Boundaries

- Keep Rust commands, event names, persistence formats, native window geometry, and generated bindings unchanged unless a UI requirement proves impossible without a backend contract change.
- Prefer shared CSS tokens and small React primitives over page-specific one-offs.
- Keep continuous animation out of React state. The GPU waveform owns its render loop; CSS owns ambient and decorative loops.
- Do not add a motion framework unless a required interaction cannot be implemented performantly with CSS or the Web Animations API.
- Preserve lazy initialization and teardown for Pixi, event listeners, timers, ResizeObserver, and media queries.

### Token layers

1. Primitive color values.
2. Semantic background, text, border, action, and state values.
3. Component material, radius, shadow, duration, easing, and z-layer values.
4. Light/dark overrides with identical semantic roles.

### Performance budget

- Animate transform and opacity for UI feedback.
- Restrict backdrop filters to persistent low-count surfaces.
- Restrict fixed atmospheric decoration to two pseudo-elements.
- Keep device-pixel ratio capped in the overlay renderer.
- Avoid scroll listeners for visual effects.
- Never run waveform rendering while the overlay is hidden.

## Verification matrix

### Automated gates

- `bun run build`
- `bun run lint`
- `bun run check:translations`
- `bun test tests/onboardingModel.test.ts`
- `bun run test:playwright`
- `bun run format:check`
- `cargo check` with the documented CMake compatibility setting
- `git diff --check`

### Visual and interaction gates

- Light and dark themes at 1360×920 and 1180×820.
- Onboarding at 1180×640.
- Overlay states at 420×160 over light and dark backdrops.
- RTL navigation, settings rows, menus, and overlay anchoring.
- Keyboard-only navigation, menu selection, dialog focus trap, Escape, and focus restoration.
- 200% zoom with no horizontal document overflow.
- Reduced motion with repeated/travel animation removed.
- Loading, empty, error, disabled, retry, cancellation, and success states.

## Delivery definition

The overhaul is complete when every production surface uses the shared visual and motion language, all existing behavior remains functional, automated gates pass, deterministic screenshots have been inspected, and remaining native-only checks are explicitly documented. Visual novelty alone is not completion; clarity, resilience, and release confidence are equal requirements.

## Implementation record — July 22, 2026

### Delivered

- Warm pearl/ink/ruby semantic palette with matched dark-mode roles.
- Bundled Manrope typography and a crisp vector product mark/wordmark.
- Translucent native navigation plane, liquid active lens, responsive content canvas, and fixed silk atmosphere.
- Refined setting groups, rows, buttons, pointer-origin feedback, controls, toggles, popovers, empty states, and history hover affordances.
- Asymmetric Home readiness composition with the voice-bloom signature, shortcut prominence, subordinate usage data, and operational readiness dock.
- Circular model-download progress adapted from the reference animation repository, with stable bytes/speed/ETA/cancel geometry.
- Ruby/gold retuning of the existing Pixi waveform and dynamic recording island, including backend preview text when supplied.
- Reworked onboarding material, progress rail, minimum-height composition, and raster-free in-app branding.
- Deterministic light, dark, onboarding, model-download, history, menu, dialog, and overlay fixtures.

### Verification evidence

- Production frontend build: passed. The existing large JavaScript chunk advisory remains; no new animation framework was added.
- ESLint: passed.
- Translation schema: passed for the English reference and all 16 translated catalogs.
- Onboarding model unit tests: 6 passed.
- Playwright: 24 passed, including RTL, 200% zoom, reduced motion, menu/dialog focus, all model states, stable copied feedback, minimum-height onboarding, and every overlay state.
- Prettier and Rust formatting: passed.
- `cargo check`: passed.
- Native Tauri development build: compiled and launched successfully when Homebrew's path was supplied so the Whisper build could locate `cmake`.
- `git diff --check`: passed.

### Native release follow-up

- Confirm the transparent overlay over several real desktop wallpapers in a signed build.
- Exercise microphone and Accessibility permission prompts from a clean macOS user account.
- Record one full shortcut → recording → transcription → paste cycle with both WebGL and forced CSS fallback.
- Recheck signed updater, autostart, tray, and single-instance behavior before distribution.
