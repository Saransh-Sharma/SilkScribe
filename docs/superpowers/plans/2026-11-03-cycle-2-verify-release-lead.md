# SilkScribe — Execution Plan: cycle 2 (verify, release 1.0, then lead)

## Context

Cycle 1 (Waves 0–5) is fully shipped on `uxOverHaul` (HEAD `b5decc6`, 130 files / ~26k lines since `57139ac`; Rust 176, Playwright 121, unit 18, worker 22, lint, tsc, strict translations all passing). The honest state is **shipped, unverified**: nothing that touches other apps, devices or macOS has run on a real Mac, the translations are machine drafts, live text has no go/no-go, speakers are unpublished, and no build is notarized.

The market moved in October: Wispr Flow added meeting notes (5 Aug), Granola added dictation (Voice Typing, 29 Oct, cloud), Superwhisper 3.0 added meetings (15 Oct), MacWhisper has live transcripts and named speakers, and Google shipped free on-device apps for both jobs (Foresight, Eloquent). **"Both jobs in one app" is no longer a differentiator.** What still is: on-device for both, audio kept and playable from every answer, consent built in (Granola faces a wiretap class action), and data the user owns.

Decisions (3 Nov): **interleave** hardening with features; **no fixed date** (1.0 ships when its gates pass); **English + reviewed languages only**, others behind "Preview languages"; bets in scope: **speakers on by default + people**, **share & integrations (incl. local MCP)**, **recipes across meetings**. Sync and iPhone are out. Standing rules: Mac direct-download is the flagship; MAS dictation-only; Win/Linux dictation parity; cloud never a default; commits attributed to Saransh only.

## Assessment (3 Nov)

**Release infrastructure**
- No CI on pushes or PRs (`.github/workflows` has only tag-triggered `release-macos.yml` and `site-pages.yml`). Nothing checks tests, lint, or that Windows/Linux compile.
- `community-1` in `src-tauri/resources/local-models.json` is `revision: "unpublished"`.
- Open gates in `docs/product/workspace-implementation-status.md`: quality evaluation, hardware fault tests, notarization + clean machine.

**UX audit (code-verified)** — the features exist, the experience around them is weak:
1. Starting a meeting lands on the Library list, not your notes (`Workspace.tsx:695`); the recording bar can't open the meeting.
2. Meeting setup is a wall of options, open by default, with raw engine names; presets show no selection.
3. Dictation settings tab holds ~35 controls; Styles vanish when cleanup is off; command mode only appears inside cleanup.
4. "Finish setup" after "Just transcribe files" only re-runs permissions — never reaches engine/shortcut/practice.
5. Ask (⌘K) only exists on Home/Library with items; no fix-it action without a notes engine; ⌘K hard-coded on Windows.
6. Home order is muddled; recent dictations appear twice; time-sensitive items sit below stats.
7. "Everything stays on this device" shows even when cleanup uses a cloud provider.
8. AI notes has no primary action; engine/template dropdowns have no visible labels; no defaults in Settings.
9. Generic/raw error text (downloads, capture checks, Ask, calendar disconnect).
10. Settings mixes `ss-*` and `ws-*` component systems; `workspace.css` has ~175 hard-coded px values.
- A11y: settings tabs lack selected state; collapsed disclosures stay tabbable; orb is mouse-only; transcript/evidence focus; tertiary text 4.07–4.36:1 fails AA at 11px; live transcripts over-announce.
- Dead code: `AboutSettings`, `AccessibilityPermissions`, `AccessibilityOnboarding`, `OnboardingTipsRotator`, `SilkField`, `DebugPaths`, `TextDisplay`; unused `home.*`, `sidebar.*`, `settings.history.*` strings.

**Competitor gaps (table stakes we lack):** named speakers by default; sharing; Slack/Notion/MCP; recipes; a dictionary that learns from corrections; folders; mic-silence warning. Out of scope: mobile, sync, Windows meetings.

**Hardening review (code-verified, ranked):**
1. Clipboard restore fires 400 ms after ⌘V — a slow app (Electron under load, remote desktop, VMs) pastes the *old* clipboard (`clipboard.rs:32,92-99`).
2. Restore re-writes password-manager `ConcealedType` items with a new changeCount, defeating auto-clear; snapshot forces lazy data on the main thread (`clipboard.rs:123-200`).
3. Call detection picks the first running call app, not the one using the mic — idle Slack during a Meet call captures Slack (`call_watch.rs:12-21,143`).
4. Command mode sends ⌘C without waiting for modifiers to lift; a failed copy falls back to "write" and overwrites the selection (`clipboard.rs:214-263`, `actions.rs:600-656`).
5. Ask waits behind any processing job with no timeout, and always evicts the dictation engine (`worker.rs:118-128`, `mod.rs:46,978-1010`).
6. Apple Intelligence `semaphore.wait()` has no timeout (threads leak after Rust gives up); 20k-char selections exceed its context; commands reuse the cleanup schema.
7. `workspace_passages` deletes by `UNINDEXED document_id` → full scans on every save/prune, under `Workspace.lock`; no WAL; connection per call.
8. Background loops (call watch 2 s, calendar 20 s) never drain an autorelease pool.
9. EventKit commands are sync → run on the main thread every 60 s/focus.
10. Passage backfill in setup + `.expect` → crash loop on failure; no versioned schema (`rusqlite_migration` is already a dependency).
- Also: MAS build still runs meetings/capture/orb/call-watch (`lib.rs:212-371`) despite "dictation-only"; `is_model_loaded()` flickers during live preview; `ask_cancelled` reset after search swallows early cancels.
- Split candidates: `Workspace.tsx` 2,204 lines (52 `useState`), `Transcript.tsx` 1,730, `store.rs` 1,848, `workspace/mod.rs` 1,220, `TranscribeAction::stop` ~230-line closure.

## Progress (3 Nov)

Done and committed (`800d5b8..HEAD`, all attributed to Saransh):
- **Waves 0–2 code:** R1, R2, R3a–g, U1, R4, U3, R5, R6, U2, U4, U6, U5, R7, a clippy cleanup so CI can deny warnings, and loose ends (capture-check error, call-prompt dismissal with the mic kept open).
- **Bets that need no hardware:** D11 mic-silence warning, M8 consent record, B3 MCP server (`silkscribe --mcp`), B2 recipes (incl. weekly recap), B4 macOS share menu, M9 folders.
- **Docs:** CHANGELOG, manual checklist §4b additions, implementation status, this plan in `docs/superpowers/plans/`.

Waiting on the user: H gate (checklist §4b on a notarized build, clean machine, D9 decision), B1a (Community-1 publish), the first push (validates CI; `macos-latest` must have the macOS 26 SDK for the Apple Intelligence bridge).

Deferred on purpose: D10 dictionary learning and D12 voice editing change dictation output paths not yet verified on hardware (after the gate); B1b people needs speakers (after B1a); R3h App Store dictation-only gating moves to the MAS release track. Not yet done: Ask scoped to one meeting or folder, tray "Ask…", default notes engine/template in Settings, splitting `Workspace.tsx`.

## Waves

Each wave pairs release/hardening work with one item per track. **1.0 ships at the end of Wave 2**, when the release gate passes.

| Wave | Release & hardening | Dictation | Meetings |
|---|---|---|---|
| 0 | R1 CI · R2 preview languages · R3 code-review fixes | U3 Home + finish-setup | U1 meeting opens on notes · R4 honest privacy claims |
| 1 | R5 dead code + copy · R6 accessibility | U2 Settings reorganised | U4 one-click meeting setup · U6 Enhance as the main action |
| 2 | H 1.0 gate (hardware, notarize, clean machine) · R7 error states | U5 Ask everywhere | B1a speakers on by default |
| 3 | | D10 dictionary learns from corrections · D11 mic-silence warning | B2 recipes · M8 consent log |
| 4 | | D12 voice editing commands | B3 open data + local MCP · B4 share |
| 5 | | | B1b people across meetings · M9 folders |

S ≤ 2 days, M 3–7 days, L 1.5–3 weeks.

### Wave 0

**R1. CI on every push and PR (S).** New `.github/workflows/ci.yml`:
- `macos-latest`: `bun install`, `bun run lint`, `bunx tsc --noEmit`, `bun run test:unit`, `bun run check:translations`, `bun run test:workspace-worker`, Playwright (chromium), `cargo fmt --check`, `cargo clippy --lib -- -D warnings`, `cargo test --lib` with the `TAURI_CONFIG` resources override, then `git diff --exit-code src/bindings.ts` (bindings must be committed).
- `ubuntu-latest` and `windows-latest`: `cargo check --lib` (dictation parity guard). Linux installs the webkit2gtk/alsa/ayatana deps.
- Cache `~/.cargo` and `target`.

**R2. Preview languages (S, in progress).** `src/i18n/reviewed-languages.json` (`["en"]`) is the one list, read by `languages.ts` and by `settings.rs` (`include_str!`). New `preview_languages` setting; `effective_app_language()` drives the tray, `resolveAppLanguage()` drives the UI. Migration v4: existing installs on an unreviewed language keep it (preview on). Selector lists reviewed languages, plus "· Preview" ones when the toggle is on. Add a language to the JSON once a native reviewer signs off.

**R3. Code-review fixes (M).** Each with a regression test where a unit test can reach it.
- **R3a Clipboard (S):** restore after `max(paste_delay_ms, 0) + 1 s`; never restore in remote-desktop/VM apps (Screen Sharing, Jump Desktop, Parallels, VMware, UTM, Citrix, Microsoft Remote Desktop/Windows App); skip restore when the snapshot holds `org.nspasteboard.ConcealedType`/`TransientType`; skip types whose data exceeds 32 MB in total.
- **R3b Command mode (S):** wait (≤500 ms) for modifiers to lift before ⌘C/⌘V; when the focused element is a text input but its text couldn't be read *and* ⌘C produced nothing, fail with "Couldn't read the selection" instead of writing.
- **R3c Apple Intelligence (S):** `wait(timeout:)` in the Swift bridge; per-provider selection cap (Apple Intelligence 6,000 chars) with a "Selection is too long" error.
- **R3d Ask (S):** reject while a job is running ("Ask is available when processing finishes"); add a 120 s timeout; don't evict the dictation engine unless memory is short; reset the cancel flag at the start.
- **R3e Native threads (S):** `autoreleasepool` around each call-watch and calendar iteration and in the Swift entry points; calendar commands `async` + `spawn_blocking`.
- **R3f Store (M):** versioned migrations via `rusqlite_migration`; passages keyed by an indexed side table so deletes are by rowid; WAL; backfill failure logs and continues instead of crashing setup.
- **R3g Call detection (M):** ask CoreAudio which process is running input (`kAudioHardwarePropertyProcessObjectList` / `kAudioProcessPropertyIsRunningInput`, macOS 14.4+); prompt for that app only; otherwise fall back to all system audio.
- **R3h MAS gating (S):** meetings, capture, orb and call watch compiled out under `mac-app-store`, matching the platform decision.

**U1. A meeting opens on your notes (S).** "Start recording" opens the new document with "Your notes" focused instead of Library (`Workspace.tsx:695`); the recording bar gets "Open notes".

**R4. Honest privacy claims (S).** The sidebar line, header badge and transcript line depend on configuration: "Runs on this Mac" only when dictation cleanup and notes are local; otherwise "AI cleanup uses {{provider}}". One helper (`privacyClaim(settings)`) used by all three.

**U3. Home order and finish setup (M).** Home: live/upcoming → needs attention → dictation readiness → one recents list (remove the duplicate). "Finish setup" routes to the first missing onboarding step, including engine download, shortcut and practice (`App.tsx:392-405`).

### Wave 1

**R5. Dead code and copy (S).** Delete the unused components above and their strings (`bun scripts/prune-locale-keys.ts`), fix copy-guide violations ("..." in `footer.*`, long labels, "Standard" vs "Clean up"), translate hard-coded engine names.

**R6. Accessibility (M).** Settings tabs as a `tablist` with `aria-selected`; collapsed `DisclosureSection` panels `inert`; orb expand/pin from the keyboard; focus moves to an opened transcript and the evidence panel, which closes on Escape; tertiary text token raised to ≥4.5:1; live transcripts announce at most once per finished turn; visible labels on notes engine/template/export/speed dropdowns; presets get `aria-pressed`.

**U2. Settings reorganised (L).** Side navigation with tab semantics: General (startup, tray, theme, language, updates, About/version) · Dictation (shortcut, mode, tap, cancel shortcut, engine + language at the top, output, indicator) · AI writing (cleanup level, provider, styles always visible, command mode with explainer, prompts) · Dictionary · Meetings & notes (call detection, consent, default preset/template/notes engine, calendar) · Audio (incl. clamshell mic) · Engines (one download list + runtime) · Privacy & storage (what stays local, retention, folders). Use the `ss-*` components throughout; Developer stays behind ⌘⇧D.

**U4. One-click meeting setup (M).** Start with the last-used preset; engines/options collapsed by default; friendly engine names; selected preset visible; app-wide toggles move to Settings → Meetings & notes.

**U6. Enhance as the main action (S).** Primary "Enhance notes" / "Write notes" button; labelled engine and template pickers; defaults come from Settings → Meetings & notes.

### Wave 2 — 1.0 gate

**H. Release gate (user-run with support).** Run `docs/product/manual-end-to-end-checklist.md` §3, §4 and §4b on a signed, notarized build on a clean Mac with networking blocked after model install; record results in the checklist against the build. Fix failures before tagging. Decide D9 (live text) from `scripts/dictation-latency.ts` (keep only if p95 `total_ms` grows ≤300 ms). Tag `v1.0.0` through `release-macos.yml`.

**R7. Error states (S).** Map known failures to plain messages with a next step: disk full on download, capture/file/runtime checks, Ask without an engine ("Download a notes engine" action), calendar disconnect.

**U5. Ask everywhere (M).** ⌘K / Ctrl+K works on every screen (Transcript, Settings); in a transcript it scopes to that meeting with a "Search all" toggle; platform-correct hint; wording follows content ("Ask your dictations and meetings"); tray "Ask…".

**B1a. Speakers on by default (M, blocked on the publisher).** Once Community-1 is published: integrate the manifest, turn speakers back on in presets, and suggest speaker names from calendar attendees (EventKit already returns them) with one-click assignment.

### Waves 3–5 — lead (post-1.0)

- **D10. Dictionary learns from corrections (M).** When you edit a pasted dictation in Library, or correct the same word twice, offer "Always write X" as a replacement. Never automatic without a tap.
- **D11. Mic-silence warning (S).** If the recording's RMS stays at the floor for 3 s, the overlay says "Can't hear you — check your mic" with the device name.
- **B2. Recipes (L).** Saved prompts run on one or many meetings with the local notes model: built-ins Follow-up email, Weekly recap, CRM notes, Interview scorecard; user recipes in settings; output cites passages like Ask; run from a transcript, from a multi-select in Library, or from ⌘K ("/recap").
- **M8. Consent log (S).** Per-meeting record of when the heads-up was copied/shown and the capture mode; "mic only" capture mode for all-party-consent places; shown in export.
- **D12. Voice editing commands (M).** Extend command mode with offline spoken punctuation, "undo that", "select last sentence", "capitalise that" — the gap macOS 27 dictation left open.
- **B3. Open data + local MCP (M–L).** A read-only stdio MCP server binary (`silkscribe-mcp`) over `history.db`: `search`, `list_meetings`, `get_meeting`, `get_dictations`, `ask`; opt-in "Mirror to a folder" writing Markdown/JSON per document. Settings shows the config snippet for Claude/Cursor.
- **B4. Share (M).** macOS share sheet (`NSSharingService`) for notes/recipes as rich text or Markdown; "Copy for Slack" and "Copy for email" formats. Direct Notion/Slack push (OAuth) only after this lands and is asked for.
- **B1b. People across meetings (L).** Local people pages from speakers + calendar attendees + Contacts: meetings together, open action items, quotes. Optional on-device voiceprints, stored only on this Mac.
- **M9. Folders (M).** Library folders and a "Move to" action; recipes and Ask can scope to a folder.

## Conventions
- New strings in `src/i18n/locales/en/translation.json`, then `bun scripts/prune-locale-keys.ts` and `bun run check:translations`. Copy follows `docs/copy-style-guide.md`.
- New commands/types: `#[specta::specta]` + `collect_commands!`; regenerate bindings with the fast `cargo test --lib`.
- New settings: `#[serde(default)]`; defaults that change for existing users get a `settings_version` step.
- Conventional commits, one per item, attributed to Saransh only (`git -c user.name=Saransh -c user.email=saransh1337@gmail.com commit`), no Claude trailer.

## Verification
- Every item: `bun run lint`, `bunx tsc --noEmit -p tsconfig.json`, `bun run test:unit`, `bunx playwright test`, `bun run check:translations`, fast `cargo test --lib`, `cargo fmt --check`, `cargo clippy`; `bun run test:workspace-worker` for worker changes. After R1, CI runs these on every push.
- UI items get a Playwright journey in `tests/workspace.spec.ts` via `src/test-fixtures/workspaceFixture.tsx`.
- Hardware-dependent behaviour is checked in Wave 2's gate, recorded in the manual checklist.
