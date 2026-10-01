/**
 * Fuente única de verdad del diseño Anki de la extensión: note types
 * (campos, plantillas, CSS), presets de configuración de mazo y helpers del
 * árbol de mazos.
 *
 * Reglas de convivencia con la colección del usuario:
 *  - Los note types y presets usan nombres e IDs namespaced ("Udemy Bridge …").
 *    Nunca se tocan los note types ni presets del usuario (ni siquiera el
 *    "Default"): el .apkg incluye sus PROPIOS presets con ID propio y los
 *    mazos de la extensión apuntan a ellos.
 *  - Todo mazo de la extensión vive bajo el mazo raíz configurable
 *    (default "Udemy Bridge"), con dos ramas:
 *        <Root>::Courses::<Curso>::<Lección>       → conceptos de la lección
 *        <Root>::Vocabulary::<Idioma>::<Curso>     → vocabulario del curso
 *  - El note type de vocabulario usa EXACTAMENTE los nombres de campo del
 *    note type "English Cards" del usuario (word, phonetic, sentence,
 *    translation, bilingual, monolingual, picture, sentence audio,
 *    word audio) para que el pipeline externo ANKI-IMAGE-SENTENCE (imágenes +
 *    corrección de traducciones) y el addon ReadPronunciation (fonética y
 *    audio) funcionen sobre estas notas sin cambios: ese pipeline selecciona
 *    notas por mazo + campo vacío, no por nombre de note type.
 */

import type { ApkgSpec } from './ankiApkgCore';

// Iconos Phosphor (MIT) en línea: el HTML de la tarjeta Anki no puede usar React.
const PEEK_INFO = '<svg class="peek-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="13" height="13" fill="currentColor"><path d="M108,84a16,16,0,1,1,16,16A16,16,0,0,1,108,84Zm128,44A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84.09,0,0,0,212,128Zm-72,36.68V132a20,20,0,0,0-20-20,12,12,0,0,0-4,23.32V168a20,20,0,0,0,20,20,12,12,0,0,0,4-23.32Z"/></svg>';
const PEEK_EYE = '<svg class="peek-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="13" height="13" fill="currentColor"><path d="M251,123.13c-.37-.81-9.13-20.26-28.48-39.61C196.63,57.67,164,44,128,44S59.37,57.67,33.51,83.52C14.16,102.87,5.4,122.32,5,123.13a12.08,12.08,0,0,0,0,9.75c.37.82,9.13,20.26,28.49,39.61C59.37,198.34,92,212,128,212s68.63-13.66,94.48-39.51c19.36-19.35,28.12-38.79,28.49-39.61A12.08,12.08,0,0,0,251,123.13Zm-46.06,33C183.47,177.27,157.59,188,128,188s-55.47-10.73-76.91-31.88A130.36,130.36,0,0,1,29.52,128,130.45,130.45,0,0,1,51.09,99.89C72.54,78.73,98.41,68,128,68s55.46,10.73,76.91,31.89A130.36,130.36,0,0,1,226.48,128,130.45,130.45,0,0,1,204.91,156.12ZM128,84a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,84Zm0,64a20,20,0,1,1,20-20A20,20,0,0,1,128,148Z"/></svg>';

/** FNV-1a 32-bit → bandas de ID numérico estables entre exportaciones. */
function fnv1a(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash >>> 0;
}

/** Tarjeta de concepto ya renderizada (HTML final de front/back). */
export interface ConceptCardInput {
	front: string;
	back: string;
	guid: string;
	tags: string[];
}

/**
 * Spec completa del .apkg de conceptos de una lección:
 * árbol <Root>::Courses::<Curso>::<Lección>, note type propio y AMBOS presets
 * (así la primera importación, sea de conceptos o de vocabulario, instala la
 * configuración completa de la extensión).
 */
export function buildConceptSpec(
	cards: ConceptCardInput[],
	course: string,
	lesson: string,
	rootDeck: string,
	lessonUrl: string
): ApkgSpec {
	const lessonPath = conceptDeckPath(rootDeck, course, lesson);
	const deckTree = conceptDeckTree(rootDeck, course, lesson);
	const fuente = lessonUrl ? `<a href="${lessonUrl}">▶ Repasar esta lección</a>` : '';
	const safeCourse = sanitizeDeckSegment(course);
	const safeLesson = sanitizeDeckSegment(lesson);
	return {
		decks: [
			{ name: deckTree[0], conf: COURSES_PRESET.id, desc: ROOT_DECK_DESCRIPTION },
			{
				name: deckTree[1],
				conf: COURSES_PRESET.id,
				desc: 'Conceptos de consolidación generados por la extensión, lección a lección.',
			},
			{
				name: deckTree[2],
				conf: COURSES_PRESET.id,
				desc: `Conceptos generados a partir de las lecciones de «${safeCourse}».`,
			},
			{
				name: lessonPath,
				conf: COURSES_PRESET.id,
				desc: `Tarjetas de consolidación de la lección «${safeLesson}».`,
			},
		],
		models: [{ ...CONCEPT_MODEL, fields: [...CONCEPT_MODEL.fields] }],
		dconfs: [COURSES_PRESET, VOCAB_PRESET],
		notes: cards.map((card) => ({
			modelName: CONCEPT_MODEL.name,
			deck: lessonPath,
			guid: card.guid,
			fields: [card.front, card.back, safeLesson, fuente],
			tags: card.tags,
		})),
	};
}

export function stableNumericId(input: string, offset: number): number {
	return offset + fnv1a(input);
}

/** GUID estable por contenido: reimportar actualiza en vez de duplicar. */
export function stableGuid(input: string): string {
	return `usb${fnv1a(input).toString(36)}`;
}

/**
 * Los nombres de mazo se segmentan por "::" en Anki: un título con "::"
 * crearía subniveles accidentales. Las comillas rompen importadores antiguos.
 */
export function sanitizeDeckSegment(name: string): string {
	return String(name || '')
		.replace(/::/g, ' — ')
		.replace(/"/g, "'")
		.replace(/[\u0000-\u001f]/g, ' ')
		.trim();
}

export const DEFAULT_ROOT_DECK = 'Udemy Bridge';

export const ROOT_DECK_DESCRIPTION =
	'Mazos generados por Kinema a partir de las lecciones que estudias. ' +
	'Usa presets propios (Udemy Bridge · Cursos / Vocabulario); no modifica otros mazos de tu colección.';

/** Rama de conceptos: <Root>::Courses::<Curso>::<Lección>. */
export function conceptDeckPath(root: string, course: string, lesson: string): string {
	return [root, 'Courses', sanitizeDeckSegment(course), sanitizeDeckSegment(lesson)]
		.map((segment) => sanitizeDeckSegment(segment))
		.join('::');
}

/** Lista de mazos ancestro completa (raíz → Courses → curso → lección). */
export function conceptDeckTree(root: string, course: string, lesson: string): string[] {
	return [
		root,
		[root, 'Courses'].join('::'),
		[root, 'Courses', sanitizeDeckSegment(course)].join('::'),
		conceptDeckPath(root, course, lesson),
	];
}

/** Rama de vocabulario: <Root>::Vocabulary::<Idioma>::<Curso>. */
export function vocabDeckPath(root: string, language: string, course: string): string[] {
	return [
		root,
		[root, 'Vocabulary'].join('::'),
		[root, 'Vocabulary', language].join('::'),
		[root, 'Vocabulary', language, sanitizeDeckSegment(course)].join('::'),
	];
}

// ─────────────────────────────────────────────────────────────────────────────
// Note type de CONCEPTOS — diseño "developer card" (terminal bar + Prism).
// Mejoras sobre la versión anterior: la píldora superior muestra la lección
// real (campo Leccion) en vez de un texto fijo, y el reverso lleva un pie con
// enlace de vuelta a la lección (campo Fuente).
// ─────────────────────────────────────────────────────────────────────────────

export const CONCEPT_MODEL_NAME = 'Udemy Bridge Concept';
export const CONCEPT_MODEL_ID = stableNumericId(CONCEPT_MODEL_NAME, 1_650_000_000_000);

const PRISM_HEAD = `<link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-java.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-properties.min.js"></script>`;

export const CONCEPT_MODEL_CSS = `/* ==========================================================
   SISTEMA DE DISEÑO DEVELOPER / INGENIERÍA DE SOFTWARE
   Udemy Bridge · Conceptos de lección
   ========================================================== */

/* --- TEMA CLARO (Clean IDE / GitHub Light) --- */
:root {
  --bg-app: #f4f5f7;
  --card-bg: #ffffff;
  --card-border: rgba(0, 0, 0, 0.08);
  --card-shadow: 0 20px 40px -12px rgba(15, 23, 42, 0.08),
                 0 6px 16px -4px rgba(15, 23, 42, 0.03);

  --text-main: #0f172a;
  --text-sub: #334155;
  --text-muted: #64748b;
  --text-dim: #94a3b8;

  --accent: #5b37e8;           /* Violeta técnico */
  --accent-light: #f5f3ff;
  --accent-glow: rgba(109, 40, 217, 0.15);

  --block-bg: #f8fafc;
  --block-border: #e2e8f0;
  --divider: #edf2f7;

  /* Terminal & Code Blocks en Modo Claro (Integrados y Suaves) */
  --code-bg: #f8fafc;
  --code-head: #f1f5f9;
  --code-border: #e2e8f0;
  --code-text: #0f172a;

  --inline-bg: #f1f5f9;
  --inline-fg: #5b37e8;
  --inline-border: #e2e8f0;

  --callout-tip-bg: #ecfdf5;
  --callout-tip-border: #10b981;
  --callout-tip-text: #065f46;

  --callout-warn-bg: #fffbeb;
  --callout-warn-border: #f59e0b;
  --callout-warn-text: #92400e;

  --callout-info-bg: #f0f9ff;
  --callout-info-border: #0ea5e9;
  --callout-info-text: #0369a1;
}

/* --- TEMA OSCURO (OneDark / Dracula Slate) --- */
.nightMode, .card.night_mode {
  --bg-app: #090a0f;
  --card-bg: #12151d;
  --card-border: rgba(255, 255, 255, 0.08);
  --card-shadow: 0 24px 48px -15px rgba(0, 0, 0, 0.7);

  --text-main: #f8fafc;
  --text-sub: #cbd5e1;
  --text-muted: #94a3b8;
  --text-dim: #64748b;

  --accent: #9a83ff;           /* Púrpura pastel */
  --accent-light: rgba(167, 139, 250, 0.12);
  --accent-glow: rgba(167, 139, 250, 0.25);

  --block-bg: #181c26;
  --block-border: #262c3b;
  --divider: #1f2533;

  /* Terminal & Code Blocks en Modo Noche */
  --code-bg: #0d1117;
  --code-head: #161b22;
  --code-border: #30363d;
  --code-text: #e6edf3;

  --inline-bg: rgba(167, 139, 250, 0.14);
  --inline-fg: #c4b5fd;
  --inline-border: rgba(167, 139, 250, 0.25);

  --callout-tip-bg: rgba(16, 185, 129, 0.1);
  --callout-tip-border: #34d399;
  --callout-tip-text: #6ee7b7;

  --callout-warn-bg: rgba(245, 158, 11, 0.1);
  --callout-warn-border: #fbbf24;
  --callout-warn-text: #fde68a;

  --callout-info-bg: rgba(14, 165, 233, 0.1);
  --callout-info-border: #38bdf8;
  --callout-info-text: #7dd3fc;
}

/* --- RESET Y BASE --- */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.card {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  background-color: var(--bg-app);
  color: var(--text-main);
  min-height: 100vh;
  margin: 0;
  padding: 40px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
}

hr#answer {
  display: none !important;
}

/* --- CONTENEDOR ANCHO PARA FIRMAS DE CÓDIGO --- */
.anki-wrapper.dev-card {
  width: 100%;
  max-width: 720px;
  margin: auto;
}

.card-box {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 22px;
  padding: 34px 32px;
  box-shadow: var(--card-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

/* --- BARRA SUPERIOR DE VENTANA (TERMINAL MINIMAL) --- */
.terminal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--divider);
}

.terminal-dots {
  display: flex;
  align-items: center;
  gap: 7px;
}

.terminal-dots .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.terminal-dots .dot.red { background-color: #ef4444; }
.terminal-dots .dot.yellow { background-color: #f59e0b; }
.terminal-dots .dot.green { background-color: #10b981; }

.context-pill, .type-pill {
  font-family: "SF Mono", "Fira Code", "JetBrains Mono", Consolas, monospace;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  background: var(--accent-light);
  padding: 4px 12px;
  border-radius: 999px;
  user-select: none;
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- PREGUNTA / HERO FRONT --- */
.front-layout {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.qa-container {
  margin: 16px 0;
  padding: 8px 0;
}

.qa-question {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.015em;
  color: var(--text-main);
  text-align: left;
}

.qa-header-back {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 1.4;
}

.soft-divider {
  height: 1px;
  background: var(--divider);
  margin: 20px 0 24px;
}

/* --- SECCIÓN DE RESPUESTA --- */
.answer-section {
  font-size: 1.05rem;
  line-height: 1.7;
  color: var(--text-sub);
}

/* --- PIE DE FUENTE (enlace de vuelta a la lección) --- */
.source-foot {
  margin-top: 22px;
  padding-top: 12px;
  border-top: 1px dashed var(--divider);
  font-size: 0.8rem;
}

.source-foot a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}

.source-foot a:hover {
  text-decoration: underline;
}

/* --- BLOQUES DE CÓDIGO (ADAPTABLES A LIGHT/DARK) --- */
pre {
  background-color: var(--code-bg) !important;
  color: var(--code-text) !important;
  border: 1px solid var(--code-border);
  border-radius: 12px;
  margin: 16px 0 !important;
  padding: 14px 18px !important;
  overflow-x: auto;
  font-family: "JetBrains Mono", "SF Mono", "Fira Code", Consolas, monospace !important;
  font-size: 0.92rem !important;
  line-height: 1.6 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

pre code {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  font-family: inherit !important;
  font-size: inherit !important;
  color: inherit !important;
  text-shadow: none !important;
}

/* Código Inline (inline code) */
code, p > code, li > code, td > code {
  font-family: "JetBrains Mono", "SF Mono", "Fira Code", Consolas, monospace;
  font-size: 0.88em;
  color: var(--inline-fg);
  background-color: var(--inline-bg);
  border: 1px solid var(--inline-border);
  padding: 2px 7px;
  border-radius: 6px;
  vertical-align: baseline;
}

/* --- CAJAS DE ALERTA Y CONCEPTOS (CALLOUTS) --- */
.tip-box, .warning-box, .concept-box, .interview-box {
  border-radius: 12px;
  padding: 14px 18px;
  margin: 16px 0;
  font-size: 0.96rem;
  line-height: 1.55;
}

.tip-box {
  background: var(--callout-tip-bg);
  border-left: 4px solid var(--callout-tip-border);
  color: var(--callout-tip-text);
}

.warning-box {
  background: var(--callout-warn-bg);
  border-left: 4px solid var(--callout-warn-border);
  color: var(--callout-warn-text);
}

.concept-box {
  background: var(--callout-info-bg);
  border-left: 4px solid var(--callout-info-border);
  color: var(--callout-info-text);
}

.interview-box {
  background: var(--block-bg);
  border: 1px solid var(--accent);
  border-left: 4px solid var(--accent);
}

.interview-box .label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  margin-bottom: 6px;
}

/* --- TABLAS COMPARATIVAS --- */
table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  margin: 18px 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--block-border);
  background: var(--card-bg);
}

th {
  background: var(--block-bg);
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 16px;
  text-align: left;
  border-bottom: 1px solid var(--block-border);
}

td {
  padding: 10px 16px;
  font-size: 0.92rem;
  color: var(--text-sub);
  border-bottom: 1px solid var(--block-border);
}

tr:last-child td {
  border-bottom: none;
}

/* --- LISTAS Y ENFASIS --- */
ul, ol {
  padding-left: 22px;
  margin: 12px 0;
}

li {
  margin-bottom: 6px;
  color: var(--text-sub);
}

b, strong {
  font-weight: 700;
  color: var(--text-main);
}

blockquote {
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
  padding: 12px 18px;
  border-radius: 0 12px 12px 0;
  margin: 16px 0;
  font-style: italic;
  color: var(--text-sub);
}

/* --- RESPONSIVE EN MÓVILES --- */
@media (max-width: 600px) {
  .card {
    padding: 14px 10px;
    font-size: 15px;
  }

  .card-box {
    padding: 24px 18px;
    border-radius: 18px;
  }

  .qa-question {
    font-size: 1.3rem;
  }

  .front-layout {
    min-height: 250px;
  }

  pre {
    padding: 12px 14px !important;
    font-size: 0.84rem !important;
  }

  table {
    font-size: 0.82rem;
  }

  th, td {
    padding: 8px 10px;
  }
}`;

const CONCEPT_FRONT_TEMPLATE = `<div class="anki-wrapper dev-card">
  <div class="card-box front-layout">

    <header class="terminal-bar">
      <div class="terminal-dots">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
      </div>
      <div class="type-pill context-pill">{{Leccion}}</div>
    </header>

    <main class="qa-container">
      <div id="qa" class="qa-question">
        {{Front}}
      </div>
    </main>

  </div>
</div>

${PRISM_HEAD}

<script>
(function initDevFront() {
  var pill = document.querySelector('.context-pill, .type-pill');
  if (pill && pill.innerText) {
    pill.innerText = pill.innerText.replace(/_/g, ' ').trim();
  }

  var qaContainer = document.getElementById('qa');
  if (qaContainer) {
    qaContainer.innerHTML = qaContainer.innerHTML.replace(/^(💻\\s*CÓDIGO|CÓDIGO)\\s*/i, '');
  }

  document.querySelectorAll('#qa code, .qa-container code').forEach(function(el) {
    el.innerHTML = el.innerHTML.replace(/<br\\s*\\/?>/gi, '\\n');
  });

  setTimeout(function() {
    if (window.Prism) window.Prism.highlightAll();
  }, 30);
})();
</script>`;

const CONCEPT_BACK_TEMPLATE = `<div class="anki-wrapper dev-card">
  <div class="card-box back-layout">

    <header class="terminal-bar">
      <div class="terminal-dots">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
      </div>
      <div class="type-pill context-pill">{{Leccion}}</div>
    </header>

    <div class="qa-header-back" id="qaBack">
      {{Front}}
    </div>

    <div class="soft-divider"></div>

    <main class="answer-section answer">
      {{Back}}
    </main>

    {{#Fuente}}
    <footer class="source-foot">{{Fuente}}</footer>
    {{/Fuente}}

  </div>
</div>

<!-- La cara B no hereda los scripts del anverso en Anki: sin estas líneas
     Prism no existe al mostrar la respuesta y el código no se resalta. -->
${PRISM_HEAD}

<script>
(function initDevBack() {
  var qaBack = document.getElementById('qaBack');
  if (qaBack) {
    qaBack.innerHTML = qaBack.innerHTML.replace(/^(💻\\s*CÓDIGO|CÓDIGO)\\s*/i, '');
  }

  document.querySelectorAll('.answer code, pre code').forEach(function(el) {
    el.innerHTML = el.innerHTML.replace(/<br\\s*\\/?>/gi, '\\n');
  });

  setTimeout(function() {
    if (window.Prism) window.Prism.highlightAll();
  }, 30);
})();
</script>`;

export const CONCEPT_MODEL: import('./ankiApkgCore').ApkgModelSpec = {
	id: CONCEPT_MODEL_ID,
	name: CONCEPT_MODEL_NAME,
	sortf: 0,
	fields: ['Front', 'Back', 'Leccion', 'Fuente'],
	templates: [{ name: 'Concepto', qfmt: CONCEPT_FRONT_TEMPLATE, afmt: CONCEPT_BACK_TEMPLATE }],
	css: CONCEPT_MODEL_CSS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Note type de VOCABULARIO — réplica del diseño "English Cards" del usuario
// (word hero + IPA + cloze de contexto al frente; significado, definición
// monolingüe, imagen, oración y traducción al reverso). Campos idénticos a
// "English Cards" para compatibilidad total con ANKI-IMAGE-SENTENCE
// (imágenes + corrección de traducciones).
//
// Audio (configurable, se envía dentro del .apkg y la reimportación lo
// actualiza):
//  · mode "field" (DEFAULT): la plantilla reproduce los campos "word audio" /
//    "sentence audio" — archivos de calidad generados con HyperTTS o el
//    sistema externo del usuario (edge-tts). Sin archivo todavía, sin botón.
//  · mode "tts": audio inmediato con las voces del sistema vía {{tts}} nativo
//    de Anki (sin archivos ni addons).
// En ambos modos una sola fuente de audio por tarjeta: cero duplicados.
// ─────────────────────────────────────────────────────────────────────────────

export type VocabAudioMode = 'field' | 'tts';

export const VOCAB_MODEL_NAME = 'Udemy Bridge Vocab';
export const VOCAB_MODEL_ID = stableNumericId(VOCAB_MODEL_NAME, 1_650_000_000_000);

export const VOCAB_FIELDS = [
	'word',
	'phonetic',
	'sentence',
	'translation',
	'bilingual',
	'monolingual',
	'picture',
	'sentence audio',
	'word audio',
] as const;

/** Bloque de audio del word/sentence según el modo elegido en la extensión. */
function vocabAudioBlocks(audioMode: VocabAudioMode): { word: string; sentence: string } {
	if (audioMode === 'tts') {
		return {
			word: `<div class="audio-inline-btn">
        {{tts en_US:word}}
      </div>`,
			sentence: `<div class="audio-inline-btn mini-audio">
          {{tts en_US:sentence}}
        </div>`,
		};
	}
	return {
		word: `{{#word audio}}
      <div class="audio-inline-btn">
        {{word audio}}
      </div>
      {{/word audio}}`,
		sentence: `{{#sentence audio}}
        <div class="audio-inline-btn mini-audio">
          {{sentence audio}}
        </div>
        {{/sentence audio}}`,
	};
}

export const VOCAB_MODEL_CSS = `/* =========================================================
   SISTEMA DE DISEÑO MINIMALISTA / ELEGANTE (ADVANCED VOCAB)
   Udemy Bridge · Vocabulario
   ========================================================== */

/* --- TEMA CLARO (Editorial Minimal) --- */
:root {
  --bg-app: #f4f5f7;
  --card-bg: #ffffff;
  --card-border: rgba(0, 0, 0, 0.07);
  --card-shadow: 0 20px 40px -12px rgba(15, 23, 42, 0.08),
                 0 6px 16px -4px rgba(15, 23, 42, 0.03);

  --text-main: #0f172a;
  --text-sub: #334155;
  --text-muted: #64748b;
  --text-dim: #94a3b8;

  --accent: #2563eb;
  --accent-light: #eff6ff;
  --accent-glow: rgba(37, 99, 235, 0.15);

  --block-bg: #f8fafc;
  --block-border: #e2e8f0;
  --divider: #edf2f7;

  --ipa-color: #0d9488;
  --cloze-bg: rgba(37, 99, 235, 0.08);
  --cloze-text: #2563eb;
}

/* --- TEMA OSCURO (Night Elegance) --- */
.nightMode, .card.night_mode {
  --bg-app: #090a0f;
  --card-bg: #12151d;
  --card-border: rgba(255, 255, 255, 0.08);
  --card-shadow: 0 24px 48px -15px rgba(0, 0, 0, 0.7);

  --text-main: #f8fafc;
  --text-sub: #cbd5e1;
  --text-muted: #94a3b8;
  --text-dim: #64748b;

  --accent: #60a5fa;
  --accent-light: rgba(96, 165, 250, 0.12);
  --accent-glow: rgba(96, 165, 250, 0.25);

  --block-bg: #181c26;
  --block-border: #262c3b;
  --divider: #1f2533;

  --ipa-color: #2dd4bf;
  --cloze-bg: rgba(96, 165, 250, 0.15);
  --cloze-text: #93c5fd;
}

/* --- RESET Y BASE --- */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.card {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  font-size: 17px;
  line-height: 1.6;
  background-color: var(--bg-app);
  color: var(--text-main);
  min-height: 100vh;
  margin: 0;
  padding: 40px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
}

hr {
  display: none !important;
}

/* --- CONTENEDOR PRINCIPAL --- */
.anki-wrapper {
  width: 100%;
  max-width: 620px;
  margin: auto;
}

.card-box {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 24px;
  padding: 40px 38px;
  box-shadow: var(--card-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

/* --- LAYOUT DEL FRENTE --- */
.front-layout {
  min-height: 380px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.front-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background-color: var(--accent);
  border-radius: 50%;
  display: inline-block;
}

.front-word-hero {
  text-align: center;
  margin: auto 0;
  padding: 24px 0;
}

.main-word.front-word {
  font-size: 3.4rem;
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.1;
  color: var(--text-main);
}

/* Fonética Peek en Front */
.peek-phonetic {
  display: inline-block;
  margin-top: 10px;
  cursor: pointer;
}

.peek-phonetic .ipa-box {
  filter: blur(6px) !important;
  opacity: 0.25 !important;
  user-select: none;
  transition: filter 0.2s ease, opacity 0.2s ease;
}

.peek-phonetic:hover .ipa-box,
.peek-phonetic:focus .ipa-box,
.peek-phonetic:active .ipa-box {
  filter: blur(0) !important;
  opacity: 1 !important;
  user-select: text;
}

/* Cloze Box en Front */
.cloze-container {
  background: var(--block-bg);
  border: 1px solid var(--block-border);
  border-radius: 16px;
  padding: 18px 22px;
  margin-top: 20px;
  text-align: left;
}

.cloze-sentence {
  font-size: 1.08rem;
  color: var(--text-sub);
  line-height: 1.5;
}

.cloze-gap {
  font-weight: 700;
  color: var(--cloze-text);
  background-color: var(--cloze-bg);
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.05em;
}

/* --- TIPOGRAFÍA GENERAL --- */
.eyebrow-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  background: var(--accent-light);
  padding: 5px 14px;
  border-radius: 999px;
  user-select: none;
}

.main-word {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", serif;
  font-size: 2.3rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
  color: var(--text-main);
}

.ipa-box {
  font-size: 1.15rem;
  font-style: italic;
  font-weight: 450;
  color: var(--ipa-color);
  margin-top: 4px;
}

.soft-divider {
  height: 1px;
  background: var(--divider);
  margin: 24px 0;
}

/* --- REVERSO: ENCABEZADO --- */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

/* --- SECCIONES Y CONTENIDO --- */
.section-block {
  margin-bottom: 22px;
}

.section-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.definition-text {
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1.5;
  color: var(--text-sub);
}

/* --- BLOQUES PEEK (BLINDAJE TOTAL CONTRA FORMATOS HEREDADOS) --- */
.peek-block {
  background: var(--block-bg);
  border: 1px dashed var(--block-border);
  border-radius: 14px;
  padding: 14px 18px;
  cursor: pointer;
  outline: none;
}

.peek-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 6px;
  transition: color 0.2s ease;
}

.peek-icon {
  stroke: var(--text-muted);
  transition: stroke 0.2s ease;
}

/* Ocultamiento asegurado para monolingual */
.peek-content {
  font-size: 1rem;
  line-height: 1.5;
  color: var(--text-sub) !important;
  filter: blur(6px) !important;
  opacity: 0.25 !important;
  user-select: none;
  transition: filter 0.2s ease, opacity 0.2s ease;
}

.peek-content * {
  color: inherit !important;
}

.peek-block:hover .peek-content,
.peek-block:focus .peek-content,
.peek-block:active .peek-content {
  filter: blur(0) !important;
  opacity: 1 !important;
  user-select: text;
}

.peek-block:hover .peek-badge,
.peek-block:focus .peek-badge {
  color: var(--accent);
}

.peek-block:hover .peek-icon,
.peek-block:focus .peek-icon {
  stroke: var(--accent);
}

/* --- IMÁGENES --- */
.card-image-wrap {
  width: 100%;
  margin: 18px 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--block-border);
  background: var(--block-bg);
  display: flex;
  justify-content: center;
  align-items: center;
}

.card-image-wrap img {
  display: block;
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
}

/* --- BLOQUE DE EJEMPLO --- */
.example-container {
  background: var(--block-bg);
  border: 1px solid var(--block-border);
  border-radius: 16px;
  padding: 22px 24px;
  margin-bottom: 0;
}

.example-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.example-text {
  font-size: 1.15rem;
  line-height: 1.55;
  color: var(--text-main);
  font-style: italic;
  font-weight: 450;
  display: block;
}

/* --- TRADUCCIÓN PEEK (BLINDADA CONTRA ESTILOS EXTERNOS) --- */
.peek-translation {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--block-border);
  cursor: pointer;
  outline: none;
  position: relative;
}

.translation-text {
  font-size: 1.05rem;
  line-height: 1.5;
  color: var(--text-sub) !important;
  filter: blur(6px) !important;
  opacity: 0.25 !important;
  user-select: none;
  transition: filter 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Fuerza a que cualquier tag <span>, <div>, <font> traído por Anki se oculte */
.translation-text * {
  color: inherit !important;
  background-color: transparent !important;
}

/* Revelación al pasar el mouse (PC) o presionar (Móvil) */
.peek-translation:hover .translation-text,
.peek-translation:focus .translation-text,
.peek-translation:active .translation-text {
  filter: blur(0) !important;
  opacity: 1 !important;
  user-select: text;
}

.peek-translation:hover .peek-badge,
.peek-translation:focus .peek-badge {
  color: var(--accent);
}

.peek-translation:hover .peek-icon,
.peek-translation:focus .peek-icon {
  stroke: var(--accent);
}

/* --- BOTONES DE AUDIO NATIVOS --- */
.replay-button, .soundLink {
  background: var(--card-bg) !important;
  border: 1px solid var(--block-border) !important;
  border-radius: 50% !important;
  width: 44px !important;
  height: 44px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06) !important;
  transition: transform 0.15s ease, border-color 0.2s ease, box-shadow 0.2s ease !important;
  text-decoration: none !important;
}

.mini-audio .replay-button, .mini-audio .soundLink {
  width: 34px !important;
  height: 34px !important;
  box-shadow: none !important;
}

.replay-button:hover, .soundLink:hover {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 5px var(--accent-glow) !important;
  transform: translateY(-2px);
}

.replay-button:active, .soundLink:active {
  transform: scale(0.94) !important;
}

.replay-button svg, .soundLink svg {
  width: 20px !important;
  height: 20px !important;
  fill: var(--accent) !important;
}

.mini-audio .replay-button svg, .mini-audio .soundLink svg {
  width: 15px !important;
  height: 15px !important;
}

.tts-speaking { display: none !important; }

/* --- RESPONSIVE EN MÓVILES --- */
@media (max-width: 500px) {
  .card {
    padding: 14px 12px;
    font-size: 16px;
  }

  .card-box {
    padding: 26px 18px;
    border-radius: 20px;
  }

  .front-layout {
    min-height: 310px;
  }

  .main-word.front-word {
    font-size: 2.4rem;
  }

  .card-header .main-word {
    font-size: 1.8rem;
  }

  .definition-text {
    font-size: 1.1rem;
  }

  .cloze-sentence {
    font-size: 1rem;
  }

  .example-container {
    padding: 16px;
  }

  .example-text {
    font-size: 1.05rem;
  }

  .translation-text {
    font-size: 0.98rem;
  }

  .card-image-wrap img {
    max-height: 220px;
  }
}`;

const VOCAB_FRONT_TEMPLATE = `<div class="anki-wrapper">
  <div class="card-box front-layout">

    <div class="front-header">
      <div class="eyebrow-tag">
        <span class="pulse-dot"></span>
        <span>Palabra objetivo</span>
      </div>

      {{AUDIO_WORD}}
    </div>

    <div class="front-word-hero">
      <h1 class="main-word front-word">{{word}}</h1>

      {{#phonetic}}
<div class="peek-phonetic" tabindex="0">
  <span class="ipa-box">{{phonetic}}</span>
</div>
{{/phonetic}}
    </div>

    <div id="hiddenWord" style="display:none">{{word}}</div>
    <div id="hiddenSentence" style="display:none">{{sentence}}</div>

    <div id="contextContainer" class="cloze-container" style="display:none;">
      <div class="section-label">Contexto cloze</div>
      <p id="clozeOutput" class="cloze-sentence"></p>
    </div>

  </div>
</div>

<script>
  (function() {
    var wordRaw = document.getElementById("hiddenWord").innerText.trim();
    var sentenceRaw = document.getElementById("hiddenSentence").innerText.trim();
    var container = document.getElementById("contextContainer");
    var output = document.getElementById("clozeOutput");

    if (wordRaw && sentenceRaw) {
      container.style.display = "block";
      var regex = new RegExp(wordRaw, "gi");
      var result = sentenceRaw.replace(regex, "<span class='cloze-gap'>[ ... ]</span>");
      output.innerHTML = result;
    } else {
      container.style.display = "none";
    }
  })();
</script>`;

const VOCAB_BACK_TEMPLATE = `<div class="anki-wrapper">
  <div class="card-box back-layout">

    <!-- Header: Palabra, Fonética y Audio -->
    <header class="card-header">
      <div class="word-info">
        <span class="eyebrow-tag">Vocabulario</span>
        <h1 class="main-word">{{word}}</h1>
        {{#phonetic}}
        <div class="ipa-box" id="ipaField">{{phonetic}}</div>
        {{/phonetic}}
      </div>
      {{AUDIO_WORD}}
    </header>

    <div class="soft-divider"></div>

    <!-- Definición Principal Bilingüe -->
    {{#bilingual}}
    <section class="section-block">
      <div class="section-label">Significado</div>
      <div class="definition-text" id="bilingualField">{{bilingual}}</div>
    </section>
    {{/bilingual}}

    <!-- Definición Monolingüe (Peek) -->
    {{#monolingual}}
    <section class="section-block peek-block" tabindex="0">
      <div class="peek-badge">
        ${PEEK_INFO}
        <span>Definición monolingüe</span>
      </div>
      <div class="peek-content mono-text">{{monolingual}}</div>
    </section>
    {{/monolingual}}

    <!-- Imagen -->
    {{#picture}}
    <div class="card-image-wrap">
      {{picture}}
    </div>
    {{/picture}}

    <!-- Ejemplo en Contexto -->
    {{#sentence}}
    <section class="section-block example-container">
      <div class="example-header">
        <span class="section-label">En contexto</span>
        {{AUDIO_SENTENCE}}
      </div>

      <div class="example-text" id="sentenceField">{{sentence}}</div>

      {{#translation}}
      <div class="peek-translation" tabindex="0">
        <div class="peek-badge">
          ${PEEK_EYE}
          <span>Traducción</span>
        </div>
        <div class="translation-text">{{translation}}</div>
      </div>
      {{/translation}}
    </section>
    {{/sentence}}

  </div>
</div>

<script>
(function cleanCardData() {
  // 1. Fonética: barras /…/ solo para IPA; lecturas en kana/CJK van sin barras
  var ipa = document.getElementById("ipaField");
  if (ipa) {
    var rawIpa = ipa.innerText.replace(/^\\/+|\\/+$/g, '').trim();
    if (rawIpa) {
      var isIpa = !/[\\u3040-\\u30ff\\u4e00-\\u9fff]/.test(rawIpa);
      ipa.innerText = isIpa ? "/" + rawIpa + "/" : rawIpa;
    }
  }

  // 2. Limpieza de la oración (remueve saltos de línea internos y comillas rotas)
  var sentence = document.getElementById("sentenceField");
  if (sentence) {
    var rawText = sentence.innerText.replace(/^[\\s"“”'«»]+|[\\s"“”'«»]+$/g, '').trim();
    sentence.innerText = "“" + rawText + "”";
  }

  // 3. Limpieza de paréntesis vacíos en la definición bilingüe ()
  var bilingual = document.getElementById("bilingualField");
  if (bilingual) {
    bilingual.innerHTML = bilingual.innerHTML.replace(/\\(\\s*\\)/g, '').trim();
  }
})();
</script>`;

export function buildVocabModel(audioMode: VocabAudioMode = 'field'): import('./ankiApkgCore').ApkgModelSpec {
	const audio = vocabAudioBlocks(audioMode);
	return {
		id: VOCAB_MODEL_ID,
		name: VOCAB_MODEL_NAME,
		sortf: 0,
		fields: VOCAB_FIELDS,
		templates: [
			{
				name: 'EN → ES',
				qfmt: VOCAB_FRONT_TEMPLATE.replace('{{AUDIO_WORD}}', audio.word),
				afmt: VOCAB_BACK_TEMPLATE.replace('{{AUDIO_WORD}}', audio.word).replace('{{AUDIO_SENTENCE}}', audio.sentence),
			},
		],
		css: VOCAB_MODEL_CSS,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets de configuración (deck options) — vivos SOLO en el .apkg de la
// extensión, con IDs propios. Nunca tocan el preset "Default" del usuario.
//
// Criterios pedagógicos:
//  · Conceptos (consolidación post-lección): 20 nuevas/día para que la lección
//    recién vista se consolide esa misma semana; pasos de aprendizaje [1m,10m]
//    (recodificación rápida el mismo día); lapso con new-interval 30% (el
//    estándar de la comunidad: 0% es punitivo) y leech marcado con tag (8
//    lapsos) para rescatar tarjetas problemáticas.
//  · Vocabulario: 15 nuevas/día (carga sostenible a diario, admite lecciones
//    consecutivas sin explosión de cola), mismos pasos de aprendizaje.
//  · Ambos: retention deseada 0.9 (igual que usa el usuario), reseñas sin
//    tope (999, como el resto de su colección), autoplay activo para las
//    tarjetas de audio.
// ─────────────────────────────────────────────────────────────────────────────

export const COURSES_PRESET_NAME = 'Udemy Bridge · Cursos';
export const VOCAB_PRESET_NAME = 'Udemy Bridge · Vocabulario';
export const COURSES_PRESET_ID = stableNumericId(COURSES_PRESET_NAME, 1_555_000_000_000);
export const VOCAB_PRESET_ID = stableNumericId(VOCAB_PRESET_NAME, 1_555_000_000_000);

export interface DeckPresetConfig {
	id: number;
	name: string;
	newPerDay: number;
	desiredRetention: number;
}

/** Config en formato legacy (schema 11) con las claves modernas que el
 *  importador de Anki actual reconoce. `fsrs: true` se envía como intento de
 *  activación directa (si el importador lo ignora, el preset queda en SM-2
 *  con estos valores y el usuario lo activa en un clic). */
export function buildDeckPreset({ id, name, newPerDay, desiredRetention }: DeckPresetConfig): Record<string, unknown> {
	return {
		id,
		name,
		mod: Math.floor(Date.now() / 1000),
		usn: 0,
		maxTaken: 60,
		autoplay: true,
		timer: 0,
		replayq: true,
		fsrs: true,
		new: {
			bury: true,
			delays: [1, 10],
			initialFactor: 2500,
			ints: [1, 4, 0],
			order: 1,
			perDay: newPerDay,
		},
		rev: {
			bury: true,
			ease4: 1.3,
			fuzz: 0.05,
			ivlFct: 1,
			maxIvl: 36500,
			perDay: 999,
		},
		lapse: {
			delays: [10],
			leechAction: 1, // 1 = marcar con tag "leech" (no suspender)
			leechFails: 8,
			minInt: 1,
			mult: 0.3, // new-interval 30%: un lapso no resetea la tarjeta a cero
		},
		dyn: false,
		newMix: 0,
		newPerDayMinimum: 0,
		interdayLearningMix: 0,
		reviewOrder: 0,
		newSortOrder: 0,
		newGatherPriority: 0,
		buryInterdayLearning: false,
		desiredRetention,
		ignoreRevlogsBeforeDate: '1970-01-01',
		easyDaysPercentages: [1, 1, 1, 1, 1, 1, 1],
		stopTimerOnAnswer: false,
		secondsToShowQuestion: 0,
		secondsToShowAnswer: 0,
		questionAction: 0,
		answerAction: 0,
		waitForAudio: true,
		sm2Retention: desiredRetention,
		weightSearch: '',
	};
}

export const COURSES_PRESET = {
	id: COURSES_PRESET_ID,
	name: COURSES_PRESET_NAME,
	config: buildDeckPreset({ id: COURSES_PRESET_ID, name: COURSES_PRESET_NAME, newPerDay: 20, desiredRetention: 0.9 }),
};

export const VOCAB_PRESET = {
	id: VOCAB_PRESET_ID,
	name: VOCAB_PRESET_NAME,
	config: buildDeckPreset({ id: VOCAB_PRESET_ID, name: VOCAB_PRESET_NAME, newPerDay: 15, desiredRetention: 0.9 }),
};
