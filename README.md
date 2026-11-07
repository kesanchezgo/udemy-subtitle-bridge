# Kinema — by Kivara

A Chrome (MV3) extension that turns any Udemy course into a learning system:
it captures the English subtitles, translates them into a Spanish overlay
synced with the video, generates full study sessions from each lecture, and
exports the result to **Anki** (concept cards + language vocabulary) and
**Obsidian** — all through your own AI provider, with nothing sent to third
parties beyond the AI endpoint you configure.

## Features

### Subtitles (EN capture → ES overlay)

- Auto-captures EN captions on lecture load (network bridge + transcript
  fallback; storyboard/sprite VTTs are rejected automatically).
- Downloads/exports the EN track as `.srt` per lecture, deduplicated.
- Auto-translates EN → ES block-by-block through the configured AI provider
  and validates the block count before applying; manual import/paste of an
  ES SRT is also available.
- Renders the ES overlay synced with the video: position (free drag or
  presets), text size, background, text color, shadow, sync offset, and it
  only hides native captions while the overlay is on.
- If the course already has native ES captions, the pipeline steps down by
  design (no capture, export/import disabled).

### Study Agent (in-page dock)

- Resizable, collapsible in-page dock (scales with the browser font size;
  wheel over the dock never scrolls the Udemy page).
- Pick an objective per course (AI-generated, or your own and refined), then
  a study session is generated per lecture from the real lesson: subtitles
  for video lectures, the article text for text lectures.
- Four steps — **Recordar → Comprobar → Aplicar → Fijar**
  (`docs/STUDY_FLOW_PEDAGOGY.md`):
  - **Recordar**: free recall before seeing the key ideas, then mark the ones
    you remembered without looking.
  - **Comprobar**: proportional check — at most `min(5, key ideas)` open
    questions: one at the level you chose, one per idea you didn't mark and,
    if you marked any, one that confirms a marked idea. Ideas that don't fit
    go to Anki as reinforcement. Each answer gets a Kinema review (what's
    right / what's missing / to remember) and a «¿Cómo sigues?» choice.
  - **Aplicar**: one practice — solve the case or explain it.
  - **Fijar**: closing summary with real data, the lesson cards (plus up to
    2 reinforcement cards from what you missed), vocabulary and the Obsidian
    note, with «Ir a la siguiente lección» right below.
- **Lesson doubts**: ask about the lesson while you work. Answers quote the
  transcript (without AI: verified transcript excerpts, marked as local);
  1 question + 2 follow-ups per thread; a resolved doubt can become a card
  (max 2 per lesson).
- **Progress**: XP and level (`floor(sqrt(xp/60)) + 1`), streaks with best
  streak, achievements from real answers; one celebration per lesson, at the
  close. Notices and celebrations share one stack, bottom-centred inside the
  dock.
- **History**: lessons with their result and pending steps, the same Anki
  due-review count as Progress (configurable root deck; shown as unknown —
  never a fake 0 — if AnkiConnect doesn't answer) and «Repasar en Anki».
  Optional Supabase sync.
- AI actions are enabled only when the configured provider actually answers
  (re-probed every 5 s until ready, then every 30 s); otherwise the dock says
  why.

### Anki export — two deck families

Everything exports under one configurable root deck — **`Kinema`** by default —
so nothing mixes with your other decks.

**Course concepts** (`<Root>::Courses::<Course>::<Lesson>`):

- One `.apkg` with everything inside: the `Udemy Bridge Concept` note type
  (developer-card design with Prism code highlighting, light/dark, lesson
  pill and a back-to-lesson footer link) and the extension's **own deck
  presets** (imported when "Import any deck presets" is enabled on the
  import screen) — 20 new/day, [1m 10m] steps, 30 % lapse retention, leech
  tagging, 0.9 desired retention. FSRS is a collection-wide switch you
  enable once in Deck Options (Anki 23.10+). Your existing decks and the
  `Default` preset are never touched; re-importing a lesson updates its
  notes instead of duplicating (content-addressed GUIDs).
- Every concept card carries a **color-coded type pill** (Concepto / Código /
  Entrevista / Comparación / Proceso / Aplicación) next to the lesson pill —
  the AI classifies each card and the design signals it (signaling principle,
  rationale and references in `docs/ANKI_PEDAGOGY.md`).
- Note types keep their `Udemy Bridge …` names and preset IDs derive from
  the original `Udemy Bridge · …` names (shown as `Kinema · Cursos` /
  `Kinema · Vocabulario`) — renaming the identifiers would fork note types
  and presets inside existing collections.

**Course vocabulary** (`<Root>::Vocabulary::<Language>::<Course>`):

- Extracts words at your configured CEFR level (A2–C2, default B1+) from the
  real lecture subtitles — English today, any language by config.
- Each card ships with a purpose-built clean sentence (8–14 words, not the
  raw subtitle), a faithful Spanish translation, POS-tagged meanings, an
  AI-generated **phonetic** (IPA — kana readings for Japanese) and a simple
  **monolingual definition** written in the target language.
- The `Udemy Bridge Vocab` note type uses the same field names as the user's
  `English Cards` type, so external pipelines (image generation, audio,
  pronunciation) fill the remaining fields without changes.
- Repeated lemmas across lessons are skipped (persistent registry + GUIDs by
  `language|lemma`); the block hides itself when the lecture subtitles are
  not in the target language.
- Audio mode selector: quality files (`word audio` / `sentence audio`, e.g.
  generated by the companion tool below) or instant system voices via
  Anki-native `{{tts}}`.

### Obsidian

- One session note per lesson through `obsidian://` URIs (no plugins, no
  servers): frontmatter plus the sections shown in
  `docs/ejemplo-nota-obsidian.md`.
- Chrome opens one external protocol per click, so «Exportar» writes only the
  note; the course index (MOC, first time per course) and the raw SRT under
  `raw/` are offered as follow-up actions in the notice («Crear índice»,
  «Guardar subtítulos»).
- Re-exporting never overwrites silently: «Añadir» appends a dated «Repaso»
  section, «Reemplazar» rebuilds the note. «Copiar» and «.md» are fallbacks;
  optional auto-save on «Terminar lección».
- Vault scaffold (`CLAUDE.md` + `AGENTS.md` mirror, index, log, templates)
  as a `.zip` from Settings. Contract: `docs/obsidian-integration.md`.

### AI providers

- Bring your own OpenAI-compatible endpoint (local proxy, OpenRouter, etc.)
  with a non-blocking validation probe, plus Gemini API fallback with key
  rotation, cooldowns and quota/rate-limit reporting. A local AI endpoint is
  also supported. Provider config always saves, even if the probe fails.

## Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select the built folder, not the repo root:

   `dist/`

Loading the root fails: Chrome would read the source manifest/TypeScript.
After pulling changes, rebuild (`npm run build`) and reload the extension.

Step-by-step guide in Spanish: [`INSTALAR.md`](INSTALAR.md).

**Branding**: the toolbar / extensions-page / store icons are the Kinema K
(`public/icons/`, master SVG + `node scripts/generate-icons.mjs` to regenerate;
see `docs/KINEMA-BRAND.md` for the identity rules).

## Typical session

1. Open a Udemy lecture (video or article); the dock mounts under the player.
2. Pick an objective (or type your own) and generate the session.
3. Recordar → Comprobar → Aplicar → Fijar; ask a lesson doubt whenever you
   get stuck. «Saltar este paso» skips a step and can be undone.
4. Export from Fijar: concepts **.apkg**, vocabulary **.apkg** and the
   **Obsidian** note — then «Ir a la siguiente lección». The ES overlay keeps
   running the whole time.

## Companion: ANKI-IMAGE-SENTENCE

The companion tool ANKI-IMAGE-SENTENCE (separate project) completes the
vocabulary decks automatically (listen mode): AI-verified translations and
bilingual definitions, generated images, and quality neural TTS
(`word audio` / `sentence audio`, mp3 24 kHz 48 kbps, silence-trimmed) with
configurable voices per language and a batch "Generar Audio TTS" mode
(`python main.py tts --deck "…"`) plus media audit/compression utilities.

## Automated QA

| Command | What it does |
|---|---|
| `npm run qa:full` | Deterministic clone (local HTTPS Udemy-shaped page + mock AI): dock injection, settings and sepia, the 4-step Study flow, Anki export notices inside the dock, Obsidian (one URI per click, then «Crear índice»), provider permission, vocabulary restore, glossary and no console errors. `node scripts/qa-full-flows.mjs --real` runs the safe subset against a real lecture. |
| `npm run qa:ai-health` | Offline asserts for the AI status: provider URLs are redacted (a Gemini `?key=` never reaches the UI, logs or the health debug entry), the blocked-action message and the header indicator in all 7 states. |
| `npm run qa:extension` | Full 12-phase E2E against `dist/`: local Udemy-shaped fixture over HTTPS, real AI through the configured provider, session render, scroll-boundary assertion, real `.apkg` audit (unzip + SQLite: deck tree, presets, note type), Obsidian URIs + duplicate guard, clipboard, typography scaling. Exit 0 = all green. |
| `node scripts/qa-anki-all.mjs N` | Anki suite ×N runs: structural `.apkg` assertions against production modules (`qa-anki-decks.mjs`), real import into desktop Anki via AnkiConnect with preset/FSRS verification, screenshots and cleanup (`qa-anki-import-verify.mjs`), and model-in-the-loop vocabulary quality via the local proxy (`qa-vocab-ai.mjs`). |
| `node scripts/qa-udemy-real.mjs` | Same E2E flow against a REAL Udemy lecture using exported session cookies (`USB_COOKIES`). Requires the provider proxy running. |
| `npm run qa:datacamp` | 14 checks against REAL DataCamp with session cookies in `.qa-datacamp-cookies.json` (git-ignored): dock only on video lessons, real course/lesson context, official WebVTT subtitles (Spanish shown as-is, English goes through the translation pipeline), video-time relay from the projector frame, study transcript, dock removal on non-video exercises. |
| `npm run qa:datacamp:flow` | FULL study flow against real DataCamp with a deterministic mock AI: generation from the DataCamp transcript, Recordar → Comprobar (verdicts) → Aplicar (challenge) → Fijar → «Lección terminada», and the history record persisted with the generated deck (ideas, questions, Anki cards) and DataCamp course/lesson names. |
| `node scripts/prompt-harness.mjs` | Prompt behaviours (SRT translation, objectives, refine, study session, vocabulary) against the live provider. |
| `node scripts/test-obsidian-export.mjs` | Unit asserts for the Obsidian builders (session note, MOC, scaffold, raw SRT, URIs). |

QA fixtures live under `tmp/` (gitignored); reports as `qa-*.png`.

## Documentation

- [`CHANGELOG.md`](CHANGELOG.md) — detailed change history.
- [`docs/STUDY_FLOW_PEDAGOGY.md`](docs/STUDY_FLOW_PEDAGOGY.md) — the 4-step
  flow, gamification, notices and lesson doubts, each decision with its
  reference.
- [`docs/ANKI_PEDAGOGY.md`](docs/ANKI_PEDAGOGY.md) — design rationale for
  both deck families with a Scopus-verified bibliography (DOIs).
- [`docs/obsidian-integration.md`](docs/obsidian-integration.md) — Obsidian
  vault contract, note formats and the vault scaffold.
- [`docs/ejemplo-nota-obsidian.md`](docs/ejemplo-nota-obsidian.md) — a full
  session note and course index exactly as they reach the vault.
- [`docs/KINEMA-BRAND.md`](docs/KINEMA-BRAND.md) — Kinema identity rules.
- [`docs/QA_HUMAN_SESSION.md`](docs/QA_HUMAN_SESSION.md) — the human timing
  session (A → B).
- Architecture notes: `docs/00…07-*.md` (plan, stack, dock/Shadow DOM,
  Udemy page integration).

## Scope and privacy

- Everything runs locally in browser storage; no Udemy servers are touched
  and nothing is uploaded.
- The only network traffic beyond Udemy itself goes to the AI provider and
  the services you configure (Supabase sync, local proxy, AnkiConnect at
  `127.0.0.1:8765` for QA/companion tooling).
- SRT only for subtitle exchange.
