# SilkScribe

**Private dictation and meeting notes for your Mac. Everything runs on your device.**

SilkScribe does two jobs in one app:

- **Dictation** — hold a shortcut, speak, and clean text appears wherever your cursor is: Mail, Slack, Notion, your editor, a chat box.
- **Meetings** — record a call with your mic and computer audio, follow a live transcript, and get a searchable transcript with speaker labels and AI notes that cite the moment they came from.

Speech recognition and AI notes run locally. There's no account, no meeting bot, and no cloud workspace. Your recordings stay on your Mac, so you can play back any line to check it.

## Why SilkScribe?

- **Private by design**: audio and transcripts stay on your device. Optional AI cleanup can use Apple Intelligence on your Mac, a local model through Ollama, or a provider you choose.
- **Audio you keep**: every transcript links back to its audio, and AI notes point to the exact moment they came from.
- **One library**: dictations, meetings and imported audio live together in one searchable Library.
- **Open source**: read the code, build it yourself, and see exactly where your data goes.

## How It Works

**Dictation**

1. **Hold** your shortcut (or tap it to keep listening hands-free)
2. **Speak** naturally — pauses, corrections and filler words are fine
3. **Release** and the text goes into the app you're using; on macOS your clipboard is put back afterwards

Optional AI cleanup tidies the text in the tone the app calls for, spelling names from the text around your cursor. Your dictionary keeps names, replacements and snippets the way you write them. On macOS, **command mode** rewrites selected text from a spoken instruction ("make this friendlier").

**Meetings**

1. **Record meeting** captures your mic and your computer's audio (or just the call app) as separate tracks. When a call starts, or a meeting on your calendar begins, SilkScribe offers to take notes
2. A **live transcript** labels lines as You or Others while the call runs, and you can type your own notes beside it
3. When you stop, SilkScribe transcribes the full recording, identifies speakers, and writes notes with sources around yours, following a template (1:1, standup, customer call…)
4. **Ask** (⌘K) any question across your meetings; answers cite the moment they came from

Everything is processed locally:

- Silence is filtered with Silero VAD
- Dictation engines: **Parakeet V3** (recommended, fast on CPU), **Whisper** (Small/Medium/Turbo/Large, GPU-accelerated when available), **Moonshine**, and **SenseVoice**
- Meeting transcripts use Qwen3-ASR with word timing; AI notes use a local Qwen model on Apple Silicon
- Dictation works on macOS, Windows and Linux; meetings and AI notes need an Apple Silicon Mac

## Quick Start

### Installation

1. Download the latest release from the [releases page](https://github.com/Saransh-Sharma/SilkScribe/releases) or the [website](https://silkscribe.app)
   - **macOS**: Also available via [Homebrew cask](https://formulae.brew.sh/cask/silkscribe): `brew install --cask silkscribe`
2. Install the application
3. Launch SilkScribe and follow setup: allow the microphone and Accessibility, and SilkScribe picks an engine for your Mac
4. Try one dictation in the practice step, then use it anywhere

### Development Setup

For detailed build instructions including platform-specific requirements, see [BUILD.md](BUILD.md).

For interactive native builds, cleaning, signing, notarization, diagnostics, and
artifact collection, use the [SilkScribe Build CLI](docs/build-cli.md):

```bash
bun run app:build
bun run app:build -- doctor
```

For signed and notarized macOS direct-download releases, see [docs/direct-download-release.md](docs/direct-download-release.md).

## Architecture

SilkScribe is a Tauri application:

- **Frontend**: React + TypeScript (Home, Library, meeting documents, settings, onboarding, the recording indicator and the meeting orb)
- **Backend**: Rust for audio capture, shortcuts, inference and storage
- **Native bridges (macOS)**: Swift for meeting capture (ScreenCaptureKit + AVAudioEngine), Apple Intelligence, the text around the cursor (Accessibility) and the calendar (EventKit)
- **Local AI runtime**: a bundled Python worker for meeting transcription, speaker detection and notes (Qwen3-ASR, pyannote, MLX)
- **Core libraries**: `transcribe-rs` (Whisper, Parakeet, Moonshine, SenseVoice), `cpal` (audio I/O), Silero VAD, `rubato` (resampling), SQLite for the Library

### Debug Mode

SilkScribe includes an advanced debug mode for development and troubleshooting. Access it by pressing:

- **macOS**: `Cmd+Shift+D`
- **Windows/Linux**: `Ctrl+Shift+D`

### CLI Parameters

SilkScribe supports command-line flags for controlling a running instance and customizing startup behavior. These work on all platforms (macOS, Windows, Linux).

**Remote control flags** (sent to an already-running instance via the single-instance plugin):

```bash
silkscribe --toggle-transcription    # Toggle recording on/off
silkscribe --toggle-post-process     # Toggle dictation with AI cleanup on/off
silkscribe --cancel                  # Cancel the current operation
```

**Startup flags:**

```bash
silkscribe --start-hidden            # Start without showing the main window
silkscribe --no-tray                 # Start without the system tray icon
silkscribe --debug                   # Enable debug mode with verbose logging
silkscribe --help                    # Show all available flags
```

Flags can be combined for autostart scenarios:

```bash
silkscribe --start-hidden --no-tray
```

> **macOS tip:** When SilkScribe is installed as an app bundle, invoke the binary directly:
>
> ```bash
> /Applications/SilkScribe.app/Contents/MacOS/SilkScribe --toggle-transcription
> ```

## Known Issues & Current Limitations

This project is actively being developed and has some [known issues](https://github.com/Saransh-Sharma/SilkScribe/issues). We believe in transparency about the current state:

### Major Issues (Help Wanted)

**Whisper Model Crashes:**

- Whisper models crash on certain system configurations (Windows and Linux)
- Does not affect all systems - issue is configuration-dependent
  - If you experience crashes and are a developer, please help to fix and provide debug logs!

**Wayland Support (Linux):**

- Limited support for Wayland display server
- Requires [`wtype`](https://github.com/atx/wtype) or [`dotool`](https://sr.ht/~geb/dotool/) for text input to work correctly (see [Linux Notes](#linux-notes) below for installation)

### Linux Notes

**Text Input Tools:**

For reliable text input on Linux, install the appropriate tool for your display server:

| Display Server | Recommended Tool | Install Command                                    |
| -------------- | ---------------- | -------------------------------------------------- |
| X11            | `xdotool`        | `sudo apt install xdotool`                         |
| Wayland        | `wtype`          | `sudo apt install wtype`                           |
| Both           | `dotool`         | `sudo apt install dotool` (requires `input` group) |

- **X11**: Install `xdotool` for both direct typing and clipboard paste shortcuts
- **Wayland**: Install `wtype` (preferred) or `dotool` for text input to work correctly
- **dotool setup**: Requires adding your user to the `input` group: `sudo usermod -aG input $USER` (then log out and back in)

Without these tools, SilkScribe falls back to enigo which may have limited compatibility, especially on Wayland.

**Other Notes:**

- **Runtime library dependency (`libgtk-layer-shell.so.0`)**:
  - SilkScribe links `gtk-layer-shell` on Linux. If startup fails with `error while loading shared libraries: libgtk-layer-shell.so.0`, install the runtime package for your distro:

    | Distro        | Package to install    | Example command                        |
    | ------------- | --------------------- | -------------------------------------- |
    | Ubuntu/Debian | `libgtk-layer-shell0` | `sudo apt install libgtk-layer-shell0` |
    | Fedora/RHEL   | `gtk-layer-shell`     | `sudo dnf install gtk-layer-shell`     |
    | Arch Linux    | `gtk-layer-shell`     | `sudo pacman -S gtk-layer-shell`       |

  - For building from source on Ubuntu/Debian, you may also need `libgtk-layer-shell-dev`.

- The recording overlay is disabled by default on Linux (`Overlay Position: None`) because certain compositors treat it as the active window. When the overlay is visible it can steal focus, which prevents SilkScribe from pasting back into the application that triggered transcription. If you enable the overlay anyway, be aware that clipboard-based pasting might fail or end up in the wrong window.
- If you are having trouble with the app, running with the environment variable `WEBKIT_DISABLE_DMABUF_RENDERER=1` may help
- **Global keyboard shortcuts (Wayland):** On Wayland, system-level shortcuts must be configured through your desktop environment or window manager. Use the [CLI flags](#cli-parameters) as the command for your custom shortcut.

  **GNOME:**
  1. Open **Settings > Keyboard > Keyboard Shortcuts > Custom Shortcuts**
  2. Click the **+** button to add a new shortcut
  3. Set the **Name** to `Toggle SilkScribe Transcription`
  4. Set the **Command** to `silkscribe --toggle-transcription`
  5. Click **Set Shortcut** and press your desired key combination (e.g., `Super+O`)

  **KDE Plasma:**
  1. Open **System Settings > Shortcuts > Custom Shortcuts**
  2. Click **Edit > New > Global Shortcut > Command/URL**
  3. Name it `Toggle SilkScribe Transcription`
  4. In the **Trigger** tab, set your desired key combination
  5. In the **Action** tab, set the command to `silkscribe --toggle-transcription`

  **Sway / i3:**

  Add to your config file (`~/.config/sway/config` or `~/.config/i3/config`):

  ```ini
  bindsym $mod+o exec silkscribe --toggle-transcription
  ```

  **Hyprland:**

  Add to your config file (`~/.config/hypr/hyprland.conf`):

  ```ini
  bind = $mainMod, O, exec, silkscribe --toggle-transcription
  ```

- You can also manage global shortcuts outside of SilkScribe via Unix signals, which lets Wayland window managers or other hotkey daemons keep ownership of keybindings:

  | Signal    | Action                           | Example                     |
  | --------- | -------------------------------- | --------------------------- |
  | `SIGUSR2` | Toggle dictation                 | `pkill -USR2 -n silkscribe` |
  | `SIGUSR1` | Toggle dictation with AI cleanup | `pkill -USR1 -n silkscribe` |

  Example Sway config:

  ```ini
  bindsym $mod+o exec pkill -USR2 -n silkscribe
  bindsym $mod+p exec pkill -USR1 -n silkscribe
  ```

  `pkill` here simply delivers the signal—it does not terminate the process.

### Platform Support

- **macOS (both Intel and Apple Silicon)**
- **x64 Windows**
- **x64 Linux**

### System Requirements/Recommendations

The following are recommendations for running SilkScribe on your own machine. If you don't meet the system requirements, the performance of the application may be degraded. We are working on improving the performance across all kinds of computers and hardware.

**For Whisper Models:**

- **macOS**: M series Mac, Intel Mac
- **Windows**: Intel, AMD, or NVIDIA GPU
- **Linux**: Intel, AMD, or NVIDIA GPU
  - Ubuntu 22.04, 24.04

**For Parakeet V3 Model:**

- **CPU-only operation** - runs on a wide variety of hardware
- **Minimum**: Intel Skylake (6th gen) or equivalent AMD processors
- **Performance**: ~5x real-time speed on mid-range hardware (tested on i5)
- **Automatic language detection** - no manual language selection required

## Roadmap

Next:

- **Live text while dictating**: experimental today; it ships if it doesn't slow down the final text (measured with `scripts/dictation-latency.ts`)
- **Speaker detection on by default**, once its engine pack is published
- **Translations**: native review of the 16 languages

See [CHANGELOG.md](CHANGELOG.md) for what has shipped.

## Troubleshooting

### Manual Model Installation (For Proxy Users or Network Restrictions)

If you're behind a proxy, firewall, or in a restricted network environment where SilkScribe cannot download models automatically, you can manually download and install them. The URLs are publicly accessible from any browser.

#### Step 1: Find Your App Data Directory

1. Open SilkScribe **Settings → Storage & privacy**
2. Copy the "App data folder" path shown there

The typical paths are:

- **macOS**: `~/Library/Application Support/com.silkscribe.app/`
- **Windows**: `C:\Users\{username}\AppData\Roaming\com.silkscribe.app\`
- **Linux**: `~/.config/com.silkscribe.app/`

#### Step 2: Create Models Directory

Inside your app data directory, create a `models` folder if it doesn't already exist:

```bash
# macOS/Linux
mkdir -p ~/Library/Application\ Support/com.silkscribe.app/models

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:APPDATA\com.silkscribe.app\models"
```

#### Step 3: Download Model Files

Download the models you want from below

**Whisper Models (single .bin files):**

- Small (487 MB): `https://blob.silkscribe.app/ggml-small.bin`
- Medium (492 MB): `https://blob.silkscribe.app/whisper-medium-q4_1.bin`
- Turbo (1600 MB): `https://blob.silkscribe.app/ggml-large-v3-turbo.bin`
- Large (1100 MB): `https://blob.silkscribe.app/ggml-large-v3-q5_0.bin`

**Parakeet Models (compressed archives):**

- V2 (473 MB): `https://blob.silkscribe.app/parakeet-v2-int8.tar.gz`
- V3 (478 MB): `https://blob.silkscribe.app/parakeet-v3-int8.tar.gz`

#### Step 4: Install Models

**For Whisper Models (.bin files):**

Simply place the `.bin` file directly into the `models` directory:

```
{app_data_dir}/models/
├── ggml-small.bin
├── whisper-medium-q4_1.bin
├── ggml-large-v3-turbo.bin
└── ggml-large-v3-q5_0.bin
```

**For Parakeet Models (.tar.gz archives):**

1. Extract the `.tar.gz` file
2. Place the **extracted directory** into the `models` folder
3. The directory must be named exactly as follows:
   - **Parakeet V2**: `parakeet-tdt-0.6b-v2-int8`
   - **Parakeet V3**: `parakeet-tdt-0.6b-v3-int8`

Final structure should look like:

```
{app_data_dir}/models/
├── parakeet-tdt-0.6b-v2-int8/     (directory with model files inside)
│   ├── (model files)
│   └── (config files)
└── parakeet-tdt-0.6b-v3-int8/     (directory with model files inside)
    ├── (model files)
    └── (config files)
```

**Important Notes:**

- For Parakeet models, the extracted directory name **must** match exactly as shown above
- Do not rename the `.bin` files for Whisper models—use the exact filenames from the download URLs
- After placing the files, restart SilkScribe to detect the new models

#### Step 5: Verify Installation

1. Restart SilkScribe
2. Open Settings → Engines & language
3. Your manually installed models should now appear as "Downloaded"
4. Select the model you want to use and test transcription

### Custom Whisper Models

SilkScribe can auto-discover custom Whisper GGML models placed in the `models` directory. This is useful for users who want to use fine-tuned or community models not included in the default model list.

**How to use:**

1. Obtain a Whisper model in GGML `.bin` format (e.g., from [Hugging Face](https://huggingface.co/models?search=whisper%20ggml))
2. Place the `.bin` file in your `models` directory (see paths above)
3. Restart SilkScribe to discover the new model
4. The model will appear in the "Custom Models" section of the Models settings page

**Important:**

- Community models are user-provided and may not receive troubleshooting assistance
- The model must be a valid Whisper GGML format (`.bin` file)
- Model name is derived from the filename (e.g., `my-custom-model.bin` → "My Custom Model")

### How to Contribute

1. **Check existing issues** at [github.com/Saransh-Sharma/SilkScribe/issues](https://github.com/Saransh-Sharma/SilkScribe/issues)
2. **Fork the repository** and create a feature branch
3. **Test thoroughly** on your target platform
4. **Submit a pull request** with clear description of changes
5. **Join the discussion** - reach out at [contact@silkscribe.app](mailto:contact@silkscribe.app)

The goal is to create both a useful tool and a foundation for others to build upon—a well-patterned, simple codebase that serves the community.

## Related Projects

- **[SilkScribe CLI](https://github.com/SilkScribe/silkscribe-cli)** - The original Python command-line version
- **[silkscribe.app](https://silkscribe.app)** - Project website with demos and documentation

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Whisper** by OpenAI for the speech recognition model
- **whisper.cpp and ggml** for amazing cross-platform whisper inference/acceleration
- **Silero** for great lightweight VAD
- **Tauri** team for the excellent Rust-based app framework
- **Community contributors** helping make SilkScribe better

---

_Private dictation and meeting notes, on your Mac, in your hands._
