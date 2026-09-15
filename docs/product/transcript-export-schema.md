# Transcript exports

JSON exports use `schema: "silkscribe.transcript"` and `version: 1`. They are a public exchange format, not a backup of the internal job record. They omit managed audio paths, runtime options, processing errors/checkpoints and unaccepted note candidates.

- `title`, `source`, `created_at` (Unix seconds), `duration` (seconds): recording metadata.
- `segments`: selected transcript turns with ID, start/end seconds, selected text, original text and nullable speaker ID. No word-level timing is implied.
- `text_version`: `original` or `edited`, according to the export choice. Notes evidence retains saved source excerpts, independently of this choice.
- `speakers`: per-recording IDs and editable names.
- `overlapping_turns`: current overlap assignments. `original_overlapping_turns` retains provenance before corrections when available.
- `notes`: summary, decisions and actions. Each item carries `sources`, a list of segment IDs, and `evidence`, its saved source excerpts (`segment_id`, text, nullable start/end and nullable `transcript_revision`). Owners and due dates may be null. `reviewed` records explicit user review; editing notes or transcript evidence clears this state. `notes_outdated` states whether notes precede the current transcript revision.
- `evidence`: the distinct saved source excerpts, with `id` identifying the transcript segment, text, timestamps and the revision at capture. The same segment ID can appear at different revisions after replacing one notes section; each note's own `evidence` selects the exact excerpt. Speaker IDs are null because excerpts do not claim historical speaker identity. This remains available for notes-only exports. Older notes without saved excerpts use the available transcript text with a null revision when original provenance cannot be established; no historical source text is fabricated.
- `timing`: `segments` or `unavailable`. Legacy dictation cannot supply real segment timing; its evidence timestamps are null. Consumers must respect `timing` even if older segments contain placeholder numeric boundaries.

Omitting speaker labels also omits overlap provenance and evidence speaker IDs. Omitting notes omits their evidence. Notes-only exports intentionally retain the short supporting excerpts; they never include unrelated transcript turns.

Markdown uses source footnotes containing supporting excerpts and actual timestamps when available. TXT includes segment start timestamps. SRT and VTT use preserved segment boundaries, omit empty/zero-duration turns, and are unavailable for legacy dictation without timestamps. Millisecond formatting is serialization precision, not a claim of millisecond alignment accuracy.

Subtitle cues are stably ordered by start time while retaining overlaps. Invalid negative/non-finite/reversed timing is rejected. Intervals that collapse to zero at millisecond serialization precision are omitted without extending their end time. WebVTT escapes literal markup characters according to the [WebVTT specification](https://www.w3.org/TR/webvtt1/). An opt-in Rust acceptance test writes both real export formats and checks their parsed timestamps and durations using development-only ffprobe.

```sh
CMAKE_POLICY_VERSION_MINIMUM=3.5 cargo test --manifest-path src-tauri/Cargo.toml --lib subtitle_outputs_parse_with_independent_ffprobe -- --ignored
```
