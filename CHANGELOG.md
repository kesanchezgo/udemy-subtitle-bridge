# Changelog

All notable changes to the Udemy Subtitle Bridge extension are documented here.

## [1.3.0] — 2026-10-01

### Added — Kinema v2 "Precisión cinematográfica" (rediseño visual completo)

- **Rebranding a Kinema — by Kivara**: nombre en manifest y notificaciones, logo K
  violeta (`#6d4aff`) con iconos regenerados (16/32/48/128 + store), y firma de marca
  en cabecera, login y dock contraído.
- **Sistema de diseño v2**: escala violeta de marca `--kinema-50…950` mapeada a los
  colores de Tailwind dentro del dock; neutros con matiz violeta en ambos temas;
  CTA sólidos sin degradados bicolor; tokens v2 en `sepia-overrides` (§26–§29,
  incluido el pulido WCAG AA del tema claro).
- **Set de iconos propio** (`components/icons.tsx`, Solar + Phosphor): adiós a Lucide
  y a los emojis de UI; los prompts de objetivos ahora piden nombres de icono
  semánticos y el legado se traduce con `resolveIconName`.
- **Navegación segmentada por iconos** y stepper de estudio reordenado
  (Nivel → Repaso → Recordar → Práctica → Anki) con navegación Anterior/Siguiente.
- **Nuevas funcionalidades**: panel de progreso y racha (`services/progress.ts`,
  `streak.ts`, `sounds.ts` + `ProgressPanel`), tarjetas de memoria con marcas de
  exportación/repaso (`study/MemoryCard.tsx` + `historyService.markExported/
  markReviewed`), módulo de exportación unificado (`study/ExportModule.tsx`) y
  fuentes web Plus Jakarta Sans + JetBrains Mono inyectadas en el documento anfitrión.
- **Dock**: ancho por defecto 540px (rango 380–720) y escala tipográfica con piso
  mínimo de 9.5–11px.

### Changed — Tarjetas Anki con identidad Kinema (solo cosmético)

- Las tarjetas exportadas adoptan el violeta de marca en sus acentos
  (claro `#5b37e8`, oscuro `#9a83ff` — ambos WCAG AA, medidos) y los
  iconos de los bloques peek de vocabulario pasan a Phosphor, en línea
  con el set de iconos de la extensión. Estructura, campos, contenido y
  reglas de generación: intactos (el limpiador del prefijo «💻» se
  conserva porque el prompt lo sigue prohibiendo).
- Contraste verificado: 6.65:1 (claro) y 6.14:1 (oscuro), frente al
  4.83:1 del morado nativo de Udemy.

### Changed — Raíz de mazos renombrada a Kinema

- El mazo raíz de la extensión pasa de «Udemy Bridge» a **«Kinema»**
  (config por defecto + descripción del mazo + fallback del TXT). La config
  guardada con el nombre legacy se migra automáticamente a «Kinema» al
  cargar; los valores personalizados del usuario no se tocan.
- Los nombres de note types y presets («Udemy Bridge Concept/Vocab»,
  «Udemy Bridge · Cursos/Vocabulario») se conservan como identificadores
  estables — renombrarlos duplicaría note types en las colecciones
  existentes. La píldora de tipo de cada tarjeta ahora tiene un color por
  tipo (señalización — ver docs/ANKI_PEDAGOGY.md §6).

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
- **Provider config now saves even when the pre-flight probe fails**: blocking the
  save on a probe 403 (e.g. the proxy rejecting browser origins) left the user with
  no saved config and no way forward. The panel always persists the config and
  surfaces the probe result as information. Real-Udemy E2E confirmed the root
  cause end-to-end: the gmifree proxy rejects browser origins with
  `HTTP 403 access_denied "Browser origin not allowed; set GMIFREE_CORS_ORIGINS"`
  — fix that env var on the proxy to accept the extension origin.
- **Validation probe no longer caps tokens**: the probe sent `max_tokens: 8`,
  which hangs reasoning-model routes on free proxies (e.g.
  `cline-free/gemini-3.8-flash` never answers a capped request but answers in
  <2 s uncapped). The probe omits `max_tokens` and uses a 45 s abort.
- **Wheel over the dock no longer scrolls the Udemy page (any tab)**: the page
  scroll is applied by the compositor without dispatching to the renderer when
  no non-passive listeners exist on `window` — the ShadowRoot guard arrived
  too late. A non-passive capture listener on `window` intercepts the wheel
  before it, prevents the default when the cursor is over the dock, and
  applies the scroll manually to the dock container under the cursor.
  `overscroll-behavior: contain` covers every dock overflow container.

### Added — Anki: estructura, configuración y vocabulario del curso

- **Árbol de mazos propio de la extensión**: todo lo generado vive bajo un
  mazo raíz configurable (por defecto `Udemy Bridge`) con dos ramas —
  `<Root>::Courses::<Curso>::<Lección>` para conceptos y
  `<Root>::Vocabulary::<Idioma>::<Curso>` para vocabulario. Nada se crea
  fuera de esa raíz.
- **Presets de estudio dedicados, instalados en la primera importación**:
  el `.apkg` incluye los presets «Udemy Bridge · Cursos» (20 nuevas/día) y
  «Udemy Bridge · Vocabulario» (15/día) con pasos `[1m, 10m]`, lapso con
  new-interval 30 %, leech marcado con tag, retención 0.9 **y FSRS activado**
  (verificado empíricamente: el flag `fsrs: true` sobrevive la importación y
  queda aplicado al preset). Los mazos de la extensión apuntan a esos presets
  por ID propio: el preset «Default» (y cualquier otro) del usuario queda
  intacto. Reimportar actualiza plantillas y preset sin duplicar nada.
- **Note type «Udemy Bridge Concept»**: el diseño dev-card (terminal bar +
  Prism) ahora viaja dentro del `.apkg` con la píldora mostrando la lección
  real (campo `Leccion`) y un pie con enlace de vuelta a la lección (campo
  `Fuente`).
- **Vocabulario del curso (idiomas)**: nuevo bloque en el paso de exportación
  que extrae de los subtítulos palabras del idioma del curso (inglés ahora,
  arquitectura abierta a cualquier idioma) en el nivel CEFR configurado
  (A2–C2, por defecto B1+) y genera tarjetas con oración limpia creada para
  la tarjeta (no el párrafo del subtítulo), traducción fiel y significado
  con POS. El note type «Udemy Bridge Vocab» usa los mismos nombres de campo
  que «English Cards», así que el pipeline externo de imágenes las completa
  sin cambios. Lemas repetidos de otras lecciones se saltan solas (registro
  persistente + GUID por `idioma|lema`, reimportar actualiza y no duplica).
  Si los subtítulos de la lección no están en el idioma objetivo (detectado
  localmente), el bloque se oculta con una explicación.
- **Audio de vocabulario con archivos de calidad (configurable)**: la
  plantilla reproduce los campos `word audio` / `sentence audio` (modo
  «Archivo de calidad», por defecto) — los genera el usuario con HyperTTS o
  su sistema externo (edge-tts). Un selector en Configurar cambia a
  «Voz del sistema» (`{{tts}}` de Anki: instantáneo, offline, sin archivos).
  El modo viaja dentro del `.apkg` y la reimportación actualiza la plantilla
  sin duplicar nada: una sola fuente de audio por tarjeta.
- **Guía de Anki con la configuración automática**: la guía paso a paso
  explica qué instala la extensión (árbol, presets con sus cifras, FSRS en un
  clic) y que el resto de la colección no se toca.
- **Checksum de notas compatible con Anki**: el `csum` es ahora SHA-1 estándar
  de Anki (antes un hash casero que rompía el buscador de duplicados).
- **Fonética y definición monolingüe generadas por la IA**: el extractor de
  vocabulario ahora rellena `phonetic` (IPA para la mayoría de idiomas;
  lectura en kana para japonés — la plantilla no envuelve kana en `/…/`) y
  `monolingual` (definición simple EN el idioma objetivo, sin usar el lema).
  La plantilla los renderiza: IPA visible en el reverso, kana sin barras y
  bloque «Definición monolingüe» con revelado difuminado. Respuestas parciales
  de modelos sin estos campos se toleran (la plantilla oculta lo vacío).
- **Diseño pedagógico documentado con evidencia**: `docs/ANKI_PEDAGOGY.md`
  racionaliza cada familia de mazos (conceptos = elaboración y transferencia;
  vocabulario = automatización léxica con contexto) con bibliografía real
  consultada vía Scopus API (20 referencias con DOI, queries documentadas).
- **Mazos demo multi-dominio**: `scripts/qa-anki-samples.mjs` importa (y deja
  en la colección) tarjetas de los 6 tipos × 3 dominios/objetivos (entrevista
  Spring Boot senior, hacking ético, Excel sin código) y vocabulario en dos
  idiomas (inglés B1+ y japonés con CJK) — construidos con el código de
  producción. Capturas: `scripts/qa-anki-sample-shots.mjs`.
- **QA**: `scripts/qa-anki-all.mjs` (suite completa re-ejecutable: estructura +
  importación real + contenido IA), `scripts/qa-anki-decks.mjs` (estructura
  del `.apkg` contra el código de producción), `scripts/qa-anki-import-verify.mjs`
  (importación real en Anki vía AnkiConnect + capturas + limpieza) y
  `scripts/qa-vocab-ai.mjs` (calidad del contenido contra el modelo real del
  proxy local). `scripts/qa-anki-delete-test-decks.mjs` borra mazos de prueba
  con backup `.apkg` previo.
- **Provider validation relay retries until acknowledged**: a runtime message
  fired while the MV3 service worker is tearing down is dropped silently, which
  left the panel waiting until the hardstop. The relay re-sends the probe
  message until the worker stamps `pending` into storage.
- **Provider validation could hang until the 45 s hardstop with no verdict**:
  `USG_VALIDATE_PROVIDER` was sent exactly once, and a runtime message fired while the
  MV3 service worker is tearing down is dropped silently — so the probe never started.
  The validation relay now retries the probe message until the worker acknowledges with
  the `pending` stamp (max 4 resends alongside the existing keepalive polling).

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
