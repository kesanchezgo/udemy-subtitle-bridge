# Changelog

All notable changes to the Udemy Subtitle Bridge extension are documented here.

## [1.2.0] — 2026-09-23

### Fixed

- **`.apkg` export was broken on real course pages**: the sql.js WASM was fetched with a
  page-relative URL, so Udemy's server returned HTML instead of the binary
  (`WebAssembly.instantiate(): expected magic word`). The WASM is now resolved via
  `chrome.runtime.getURL()` with a 15 s timeout and a clear error message.
- **Anki duplicated notes on re-import**: note GUIDs were derived from the card's
  position, so any change in card count/order shifted GUIDs and re-imports created
  duplicates. GUIDs are now content-addressed (deck + front text): re-importing a
  lesson **updates** the existing notes instead of duplicating them.
- **Lecture context never reached the in-page dock**: `LECTURE_CONTEXT_UPDATE` was sent
  via `chrome.runtime.sendMessage`, which never echoes to the sending context — the dock
  kept its demo placeholders on real course pages. The bridge now delivers
  content→sidebar messages through window events (same context) and mirrors them via
  runtime for popups.
- **Objectives race**: objectives are now regenerated automatically when the real
  lecture context replaces the placeholder course name (revalidate-on-key-change);
  no manual "Regenerar" needed after opening a lecture.
- **Deck name safety**: course/lesson titles containing `::` (accidental sub-deck
  nesting) or `"` are sanitized in `.apkg` and `.txt` exports.
- **Provider error masking**: when the configured provider failed, refine/objectives
  reported "No Gemini API keys configured" instead of the actual provider error.

### Added

- **Obsidian integration**: one-click export of the study session to a vault — session
  note (`wiki/fuentes/<curso>---<leccion>.md`), auto course MOC (`cursos/`) with a
  Dataview index, `#flashcards` for the Spaced Repetition plugin, optional raw SRT to
  `raw/`, clipboard/`.md` fallbacks, vault scaffold creation from zero, and a real-time
  diagnostic breadcrumb. See `docs/obsidian-integration.md` and
  `docs/ejemplo-nota-obsidian.md`.
- **Shared prompt module** (`src/shared/prompts.ts`): single source of truth for the
  four AI prompts, imported by both the extension and the QA harness (no more prompt
  drift between code and tests).
- **Prompt quality pass**: SRS principles for Anki cards (self-contained, active recall,
  no overlap, objective-driven), speaker-label and sound-cue rules for SRT translation,
  JSON-safety rules for objectives, few-shot examples with valid JSON and the dev-card
  HTML vocabulary.
- **QA harnesses** (real extension + real AI through the configured provider):
  - `scripts/qa-extension-local.mjs` — full E2E on a local Udemy-shaped fixture:
    dock mount, objectives, session, full stepper, clipboard, `.apkg` download +
    SQLite audit, Obsidian URI capture, duplicate guard, typography scales.
  - `scripts/qa-udemy-real.mjs` — the same flow against a real Udemy lecture using
    exported session cookies (`USB_COOKIES`).
  - `scripts/prompt-harness.mjs` — 12 prompt behaviours against the live provider.
  - `scripts/test-obsidian-export.mjs` — builder unit asserts (Node).
- Course/lesson names auto-filled from the real page metadata via `chrome.storage.sync`
  (respects user edits; only overwrites demo placeholders).
- `npm run qa:extension` script.

### Changed

- Dock default width 460 → 500 px with a 1.1 typography comfort floor (≈550 px
  effective), scaling with the browser/OS font setting (validated 550 → 660 px).
- Anki card templates replaced with the dev-card design (terminal bar, Prism on BOTH
  faces — the back face was missing the Prism includes and never highlighted code).
- Provider fallback chain: refine-objective now also tries the configured provider.

## [1.1.1] and earlier

See git history.
