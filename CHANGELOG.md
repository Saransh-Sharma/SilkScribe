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
- `scripts/dictation-latency.ts` summarises dictation timing from the logs (p50/p95 per engine), split by whether live text was on.

### Changed

- App copy rewritten to a style guide (`docs/copy-style-guide.md`); translations whose English changed now fall back to English until retranslated.
- History keeps 500 dictations by default instead of 5.
- The dictation engine loads at launch, so the first dictation doesn't wait for it.
- A shortcut press during transcription now starts the next dictation when the current one finishes.
- The mic opens at its current sample rate on macOS, so a call in progress isn't disturbed.
- On macOS, pasting puts back what was on your clipboard (images and files included), and clipboard managers skip the pasted text. Windows and Linux type the text instead of describing a restore they can't do.
- AI cleanup gives up after 30 seconds and pastes the transcript, so a provider that never answers can't hold up dictation.
- Translations: the missing strings in all 16 languages are first drafts awaiting native review, and the translation check now also checks placeholders and each language's plural forms.

### Fixed

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
