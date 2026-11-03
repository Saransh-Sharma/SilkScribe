# Copy style guide

How SilkScribe talks. Applies to `src/i18n/locales/en/translation.json`, the
tray, overlay, toasts, and backend errors that reach the UI.

## Voice: warm, not wordy

- Talk to the user as "you". Describe the outcome, not the mechanism: "Your
  words appear wherever you're typing", not "Transcribed text is inserted at the
  active cursor position".
- Warmth goes where people feel something: onboarding, empty states, success
  moments. Settings stay plain.
- Labels are nouns or short verb phrases. Add a description only when it says
  something the label can't.
- Use macOS's own names for system things: Accessibility, System Settings,
  Privacy & Security, Screen & System Audio Recording, Allow / Don't Allow.

| Surface               | Tone                           | Length                             |
| --------------------- | ------------------------------ | ---------------------------------- |
| Onboarding titles     | warm, encouraging              | ≤ 6 words                          |
| Onboarding body       | warm, one idea                 | 1 sentence, ≤ 15 words             |
| Empty states          | warm + next action             | title ≤ 6 words, 1 sentence body   |
| Success toasts        | light ("You're all set")       | ≤ 5 words                          |
| Settings labels       | plain                          | ≤ 4 words                          |
| Settings descriptions | plain, only if non-obvious     | 1 sentence, ≤ 14 words             |
| Errors                | calm: what happened + what now | title ≤ 6 words, body ≤ 1 sentence |
| Overlay, tray         | status words                   | 1–3 words                          |

## Rules

1. **The app isn't the subject.** Use "we", the imperative, or the passive.
   "Couldn't download the engine", not "SilkScribe couldn't download the
   model". Say "SilkScribe" only where macOS shows it (permission prompts,
   System Settings) and on welcome screens.
2. **No label echo.** "Volume — Adjust the volume of audio feedback sounds"
   becomes just "Volume".
3. **One sentence.** Cut "Optionally", "Automatically", "This allows you to",
   "Choose whether…".
4. **Sentence case**, except proper nouns (Whisper, Parakeet, Apple
   Intelligence, macOS) and tray menu items, which follow the macOS menu
   convention (Title Case: "Check for Updates…", "Quit SilkScribe").
5. **Periods** only on full sentences. Labels, buttons, titles, toast titles and
   status words have none.
6. **Ellipsis** is the single `…` character, used for progress ("Downloading…")
   and for actions that open another step ("Choose files…"). Never `...`.
7. **Buttons are verbs** that name the outcome: "Download", "Try again",
   "Delete transcript". Never "OK" or "Yes".
8. **Errors** read "Couldn't <verb> <thing>" as the title. The underlying
   message goes on a second line (`toastError(t("…"), error)` in
   `src/lib/utils/toastError.ts`), never spliced mid-sentence. No "Please".
9. **Confirmations**: the title is a question naming the thing ("Delete Whisper
   Small?"), the body gives the consequence in one sentence, and the confirm
   button repeats the verb.
10. **Contractions** (can't, you'll, we're). Curly apostrophes and quotes
    (’ “ ”) in `translation.json`.
11. **No marketing adjectives** in the UI: seamless, effortless, powerful.
12. **Counts** use i18next plurals (`_one` / `_other`) and digits.
13. **Shortcuts**: "Hold {{shortcut}}", with the shortcut formatted by
    `formatKeyCombination`.
14. **Accessible names stand alone.** An `aria-label` or input label must make
    sense without the surrounding layout ("Speaker name", not "Name"; "Edit
    transcript", not "Edit").

## Glossary

| Concept                        | Say                                      | Don't say                                       |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------- |
| Speech-to-text model           | engine                                   | model, speech engine, local engine              |
| Local LLM for notes            | notes engine (the feature is "AI notes") | notes model, local AI notes, local intelligence |
| LLM behind AI cleanup          | model (it's the provider's term)         | —                                               |
| macOS Accessibility permission | Accessibility                            | text access                                     |
| System audio capture           | computer audio                           | system audio recording access                   |
| Hotkey dictation               | dictation, dictate                       | transcription shortcut                          |
| LLM rewrite of dictation       | AI cleanup                               | post-process, post-processing, refinement       |
| Instruction for AI cleanup     | prompt                                   | prompt template                                 |
| Saved item                     | transcript                               | transcription (as a noun), entry                |
| Diarization                    | speakers, "Identify speakers"            | speaker separation, diarizing                   |
| The list of transcripts        | Library                                  | history, archive                                |
| Hotkey                         | shortcut                                 | hotkey, keybinding                              |
| Floating recording pill        | recording indicator                      | overlay                                         |

## Changing copy

1. Edit `src/i18n/locales/en/translation.json`.
2. Run `bun scripts/prune-locale-keys.ts` to drop now-stale translations from
   the other locales (they fall back to English until retranslated).
3. Run `bun run check:translations`.

Backend errors that reach the UI (`Err(String)` / `bail!` in `src-tauri/`) show
as the detail line under a translated title, so write them as a short
explanation that ends with what to do.
