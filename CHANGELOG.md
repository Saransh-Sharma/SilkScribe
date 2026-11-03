# Changelog

## [Unreleased]

### Added

- **Meetings workspace**: record a meeting with your mic and computer audio as separate tracks, then get a transcript with word timing (Qwen3-ASR), speaker labels, and local AI notes whose every item cites the transcript. Imports audio files too.
- **Library**: dictations, meetings and imported audio in one searchable list, with an editor, audio playback, speaker renaming and merging, notes review, and export to TXT, Markdown, SRT, VTT and JSON.
- **Live transcript and meeting orb**: while a meeting records, lines appear as You or Others, and a floating orb on the screen edge shows them with pause, resume and stop.
- **Dictation during meetings**: dictate while a meeting records; your dictated words are kept out of the meeting.
- **Five-cue sound feedback**, a redesigned recording indicator with light and dark themes, and a rebuilt onboarding that recovers when permissions change.
- **AI cleanup, first-class**: clean up every dictation or only with its own shortcut, at three levels (Light, Clean up, Rewrite), on this Mac with Apple Intelligence when available. Library and the tray keep the text from before cleanup.
- **Writes the way each app needs**: cleanup adjusts its tone to the app you're dictating into (casual in Slack, formal in Mail, exact in code editors), and can use the text around your cursor to spell names right. Nearby text only goes to a cloud provider if you allow it.
- **Command mode** (macOS): select text, hold Control-Shift-Space and say how to change it, or say what to write. A failed command never pastes over your text.
- **Dictionary**: multi-word vocabulary, replacements ("gonna" → "going to") and snippets that expand a short phrase into longer text, with import and export, and "Add to dictionary" from any dictation.
- **Tap for hands-free**: with hold-to-talk, a quick tap keeps listening until the next press.
- **Your notes first**: type notes beside the live transcript; they're kept through processing, exported, and **Enhance** builds cited AI notes around them.
- **Notes templates**: General, 1:1, Standup, Customer call, Interview and Lecture, each with its own cited sections.
- **Call detection**: when a call starts in Zoom, Teams, Webex, FaceTime, Discord or Slack, the meeting orb offers to take notes, and a recording can capture just the call app.
- **Calendar** (opt-in, on this Mac): upcoming meetings on Home, notes named after the meeting, and a reminder as each one starts.
- **Ask your meetings** (⌘K): ask a question across transcripts and your notes; the answer cites its sources and each citation plays that moment.
- **Consent heads-up**: a reminder to tell people when recording starts, and a message you can copy to let them know.
- Home leads with dictation: words today, your streak and recent dictations. Onboarding has a step to pick your shortcut and mode.
- Experimental **live text while dictating**, off by default.
- **Preview languages**: languages a native speaker hasn't reviewed yet are listed only when Preview languages is on (Settings → General); otherwise the app uses English. Existing installs keep the language they use.
- Starting a meeting opens it on **Your notes**, and the recording bar can always get back to them.
- **Ask from anywhere**: Command-K (Ctrl+K) works from a transcript or Settings too; without a notes engine, Ask offers to get one.
- **Let AI apps read your library** (Settings → Privacy & storage, off by default): Claude, Cursor and other MCP apps can search and read transcripts, notes and dictations through `silkscribe --mcp`, a read-only server built into the app. Settings shows the config to paste.
- **Recipes**: write a follow-up email, action items, customer notes or an interview summary from a meeting, or describe what you want, with the local notes engine; **Recap my week** (in the Ask box) writes up the past week's meetings. Like Ask, everything cites its source and nothing leaves the Mac.
- **Consent record**: each meeting notes whose audio it captured, whether the reminder to tell people showed, and when the heads-up was copied; exports include it.
- The recording indicator says when the mic hears nothing for three seconds.
- CI checks every push: lint, the frontend build, unit, translation, worker, browser and Rust tests, clippy, and that Windows, Linux and the App Store build still compile.
- `scripts/dictation-latency.ts` summarises dictation timing from the logs (p50/p95 per engine), split by whether live text was on.

### Changed

- **Settings** has eight sections in a side list (General, Dictation, AI writing, Dictionary, Meetings & notes, Audio, Engines, Privacy & storage), each control in one place. The call prompt and consent reminder moved from meeting setup to Meetings & notes; the cancel shortcut and laptop mic moved out of the hidden Developer panel.
- **Home** leads with what's in progress, what needs attention and what's coming up, then dictation; recent dictations are listed once.
- **Meeting setup** is chosen by preset (the one in use shows as selected), with engine options collapsed and described by what they're for.
- Writing or enhancing notes is the main action on a meeting's notes; the engine and template pickers have labels.
- "Everything stays on this device" only shows when it's true: with a cloud AI cleanup provider, the app says which one.
- Errors say what to do next: not enough disk space for an engine (with the sizes), engine and file checks, recording access, and Ask.

- App copy rewritten to a style guide (`docs/copy-style-guide.md`); translations whose English changed now fall back to English until retranslated.
- History keeps 500 dictations by default instead of 5.
- The dictation engine loads at launch, so the first dictation doesn't wait for it.
- A shortcut press during transcription now starts the next dictation when the current one finishes.
- The mic opens at its current sample rate on macOS, so a call in progress isn't disturbed.
- On macOS, pasting puts back what was on your clipboard (images and files included), and clipboard managers skip the pasted text. Windows and Linux type the text instead of describing a restore they can't do.
- AI cleanup gives up after 30 seconds and pastes the transcript, so a provider that never answers can't hold up dictation.
- Translations: the missing strings in all 16 languages are first drafts awaiting native review, and the translation check now also checks placeholders and each language's plural forms.

### Fixed

- The clipboard came back 400 ms after pasting, so a busy app could paste the old clipboard instead of the dictation; it now waits a second, leaves password-manager items cleared, and doesn't restore in remote-desktop and VM apps.
- In toggle and hands-free modes, a stop press still held down could turn the simulated copy or paste into another shortcut; both wait for the keys to lift, and command mode gives up rather than risk the selection.
- Apple Intelligence requests that never answered kept a thread each; commands get free-form answers and a selection limit that fits the on-device model.
- A question asked during meeting processing waited minutes and unloaded the dictation engine; Ask now says to wait, times out, and keeps dictation loaded.
- Call detection offered notes for whichever call app was open first (an idle Slack during a Teams call); on macOS 14.2 and later it uses the app actually on the call.
- Ask's index scanned the whole library on every save; updates are per document, and the library database uses write-ahead logging.
- Background call and calendar checks no longer leak native memory, and calendar reads no longer run on the main thread.
- "Finish setup" on Home now reaches the engine, shortcut and practice steps, not only permissions.
- Keyboard and screen reader: collapsed settings sections are out of the tab order, the meeting orb works from the keyboard, focus moves into an opened transcript and the note evidence panel (Escape closes it), live transcripts no longer announce every caption, and small grey text meets WCAG AA contrast.

- The AI cleanup shortcut did nothing until a prompt was picked by hand; the Clean up prompt is now selected by default, and the recording indicator says when cleanup didn't run.
- Meeting jobs no longer ask for speaker detection while its engine isn't available.
- "Mute other audio" is back in Settings → Audio, the paste delay setting saves again, Home shows the shortcut in a readable form, and retried dictations update their Library copy.

## [0.3.0] - 2025-07-11

### Added

- **Translate to English** setting: Added automatic translation of speech to English
- Settings refactored into React hooks for better state management
- Audio device switching capability
- Hysteresis to VAD (Voice Activity Detection) for more stable recording

### Changed

- Major audio backend refactor for improved performance and reliability
- Moved audio toolkit into src-tauri directory for better permissions handling
- Model files no longer need to be downloaded separately for releases
- Updated settings components and transcription logic

### Fixed

- Audio toolkit permissions issues
- Various stability improvements

## [0.2.3] - 2025-07-03

### Fixed

- Keycode bug that was causing input issues
- Whisper model optimization: switched to unquantized Whisper Turbo, updated Whisper Medium quantization to 4_1

## [0.2.2] - 2025-07-02

### Fixed

- Removed 50ms delay feature flag for Windows (now applies to all platforms for consistency)

## [0.2.1] - 2025-07-01

### Added

- Ctrl+Space key binding for Windows platform

### Fixed

- Windows crash issue
- Model loading on startup when available
- Windows paste functionality bug

## [0.2.0] - 2025-06-30

### Added

- **Microphone activation on demand**: More efficient resource usage
- Less permissive VAD settings for better accuracy

### Changed

- Improved microphone management and activation system

## [0.1.6] - 2025-06-30

### Added

- **Multiple models support**: Users can now select from different transcription models
- Model selection onboarding flow
- Cleanup and refactoring of model management

### Changed

- Enhanced user experience with model selection interface
- Better language and UI tweaks

## [0.1.5] - 2025-06-27

### Added

- **Different start and stop recording sounds**: Enhanced audio feedback
- Recording sound samples for better user experience

## [0.1.4] - 2025-06-27

### Fixed

- Build issues
- Auto-update functionality improvements

## [0.1.3] - 2025-06-26

### Fixed

- Paste functionality using enigo library for better cross-platform compatibility

## [0.1.2] - 2025-06-26

### Added

- **Auto-update functionality**: Application can now automatically update itself
- Footer displaying current version
- Improved menu system

### Changed

- Better user interface for version management
- Enhanced update workflow

## [0.1.1] - 2025-06-25

### Added

- **Comprehensive build system**: Support for Windows, macOS, and Linux
- Windows code signing for trusted installation
- Ubuntu/Linux build support with Vulkan
- Model file download and packaging for releases
- GitHub Actions CI/CD workflow

### Changed

- Improved build process and release workflow
- Better cross-platform compatibility

### Fixed

- Various build-related issues across platforms

## [0.1.0] - 2025-05-16

### Added

- **Initial release** of SilkScribe
- Basic speech-to-text transcription functionality
- Voice Activity Detection (VAD) for automatic recording
- Cross-platform support (macOS, Windows, Linux)
- **Tauri-based desktop application** with React frontend
- **Global keyboard shortcuts** for activation
- **Clipboard integration** for automatic text insertion
- **LLM integration** for enhanced transcription processing
- **Configurable settings** including:
  - Custom key bindings
  - Audio device selection
  - Microphone settings
  - Push-to-talk functionality
- **System tray integration** with recording indicators
- **Accessibility permissions** handling for macOS
- **Settings persistence** with unified settings store
- **Background operation** capability
- **Multiple audio format support** with on-the-fly resampling
- **Whisper model integration** for high-quality transcription
- **MIT License** for open-source distribution

### Technical Implementation

- Built with Tauri (Rust backend) and React (TypeScript frontend)
- Audio processing with cpal and whisper-rs
- Real-time transcription with performance optimizations
- Cross-platform keyboard event handling
- Modular architecture with managers for audio, models, and transcription
