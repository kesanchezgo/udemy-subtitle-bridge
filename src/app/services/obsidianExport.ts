/**
 * obsidianExport.ts
 * ─────────────────
 * Puente de la extensión hacia un vault de Obsidian, universal: sirve para
 * cursos de cualquier plataforma (Udemy, YouTube, Coursera…), libros o
 * cualquier aprendizaje personal.
 *
 * Mecanismo de escritura: URI scheme nativo de Obsidian (`obsidian://new`).
 * No requiere plugins ni servidores: Obsidian registra el protocolo al
 * instalarse y crea la nota en la ruta indicada del vault. Fallbacks: copiar
 * al portapapeles y descargar el .md.
 *
 * UNA URI POR CLIC: Chrome bloquea un segundo protocolo externo hasta la
 * siguiente interacción del usuario («flooded with requests»). Por eso
 * exportar abre SOLO la nota de la lección; el índice del curso y los
 * subtítulos se ofrecen después como acciones propias (cada una, su clic),
 * y la estructura del vault se descarga como .zip en vez de abrir 7 URIs.
 *
 * Convenciones del vault (ver CLAUDE.md del vault):
 *   <vault>/
 *   ├── raw/<fuente>/<curso>/        material bruto inmutable (srt, pdf…)
 *   ├── cursos/<curso>.md            MOC del curso (índice con Dataview)
 *   ├── wiki/fuentes/<curso>---<leccion>.md   una nota por sesión
 *   ├── wiki/conceptos/              destilado multi-fuente (supervisado)
 *   ├── wiki/entidades/ y wiki/sintesis/
 *   └── plantillas/
 *
 * Los builders son funciones puras: scripts/test-obsidian-export.mjs los
 * ejercita en Node sin chrome.
 */

// La extensión .ts explícita permite que Node (scripts/test-obsidian-export.mjs)
// importe este módulo directamente; Vite y tsc (allowImportingTsExtensions) lo
// resuelven igual.
import { chromeLocalStorage } from './chromeStorage.ts';
import { bloomTaskLabel } from '../../shared/prompts.ts';

export interface ObsidianExportConfig {
	/** Nombre EXACTO del vault tal como aparece en el selector de Obsidian. */
	vaultName: string;
	/** Carpeta del vault donde caen las notas de sesión. */
	sourcesFolder: string;
	/** Carpeta del vault para los MOCs de curso. */
	mocsFolder: string;
	/** Incluir las tarjetas Anki en formato Spaced Repetition (#flashcards). */
	includeCards: boolean;
	/** C6: repasar también en Obsidian con el formato del plugin Spaced Repetition. Apagado por defecto: un solo planificador. */
	srFlashcards?: boolean;
	/** Exportar automáticamente al terminar de generar la sesión. */
	autoExport: boolean;
	/** Guardar el SRT crudo (EN) en raw/<plataforma>/<curso>/ junto a la sesión. */
	includeRawSrt: boolean;
}

export const OBSIDIAN_EXPORT_STORAGE_KEY = 'obsidian_export_config';
export const OBSIDIAN_CREATED_MOCS_KEY = 'obsidian_created_mocs';
export const OBSIDIAN_EXPORTED_NOTES_KEY = 'obsidian_exported_notes';

export const DEFAULT_OBSIDIAN_EXPORT_CONFIG: ObsidianExportConfig = {
	vaultName: '',
	sourcesFolder: 'wiki/fuentes',
	mocsFolder: 'cursos',
	includeCards: true,
	autoExport: false,
	includeRawSrt: false,
};

/** Resumen de cierre de la lección (el mismo que muestra Study, §1.4). */
export interface StudyResultSummary {
	/** Título del cierre: «Lección dominada» / «Lección completada» / «Lección con pasos pendientes». */
	title: string;
	remembered: { count: number; total: number };
	check: { firstTry: number; improved: number; skipped: boolean };
	practice: 'done' | 'correct' | 'later';
	calibration?: { said: string; shown: string; message: string };
	cards: { total: number; reinforce: number; destination: 'anki' | 'obsidian' | 'none'; /** §5: guardadas desde dudas. */ doubt?: number };
}

/** Forma mínima del contenido de sesión que la nota necesita. */
export interface ObsidianSessionData {
	/** C9: ruta real del mazo Anki de la lección (frontmatter anki_deck). */
	ankiDeck?: string;
	courseName: string;
	lessonName: string;
	objective?: string;
	/** URL de la lección (la página donde corre el dock). */
	sourceUrl?: string;
	platform?: string;
	/** Recuerdo libre del paso 1 (viaja como «Lo que recordé sin mirar»). */
	recallNotes?: string;
	/** Preguntas respondidas mal o parcial: la pregunta con su respuesta correcta. */
	weakPoints?: { q: string; answer: string }[];
	/** Ideas clave que no marcaste en Recordar (las mismas que Anki refuerza). */
	unrecalledIdeas?: string[];
	/** La práctica se intentó sin acierto o se vio la solución: repetirla. */
	practiceToRedo?: boolean;
	/** §5: dudas resueltas sobre la lección (respuesta + citas verificadas). */
	doubts?: { q: string; answer: string; quotes: string[]; outside: boolean; t?: string }[];
	/** Resumen de cierre del flujo (§1.4) para la nota. */
	result?: StudyResultSummary;
	/**
	 * Programa (career track) al que pertenece el curso, si el usuario eligió
	 * uno: frontmatter `programa`/`programa_slug` y enlace al MOC del programa.
	 * Opcional — Udemy no tiene programa y DataCamp solo cuando se eligió.
	 */
	program?: { title: string; slug: string };
	/**
	 * TODOS los programas a los que pertenece el curso (slugs): la sesión se
	 * mapea a cada uno, así el MOC de CUALQUIER programa del curso la encuentra
	 * con Dataview — un curso puede estar en varios programas a la vez.
	 */
	programs?: string[];
	content: {
		relevance: { score: number; reason: string };
		keyConcepts: string[];
		quickWin?: string;
		questions: { q: string; bloom?: string; difficulty?: string; hint?: string; answer?: string }[];
		application: { isCode: boolean; setup: string; challenge: string; solution: string };
		interviewQ: { q: string; idealAnswer: string } | null;
		nextAction: string;
		ankiCards: { front: string; back: string; type?: string }[];
	};
}

export interface VaultNote {
	/** Ruta relativa dentro del vault, con carpetas y extensión .md. */
	path: string;
	markdown: string;
}

// ── Config persistida ────────────────────────────────────────────────────────

export async function loadObsidianExportConfig(): Promise<ObsidianExportConfig> {
	try {
		const items = await chromeLocalStorage.get([OBSIDIAN_EXPORT_STORAGE_KEY]);
		const raw = items[OBSIDIAN_EXPORT_STORAGE_KEY] as Partial<ObsidianExportConfig> | undefined;
		if (!raw) return { ...DEFAULT_OBSIDIAN_EXPORT_CONFIG };
		return {
			vaultName: String(raw.vaultName ?? '').trim(),
			sourcesFolder: String(raw.sourcesFolder ?? DEFAULT_OBSIDIAN_EXPORT_CONFIG.sourcesFolder).replace(/^\/+|\/+$/g, ''),
			mocsFolder: String(raw.mocsFolder ?? DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder).replace(/^\/+|\/+$/g, ''),
			includeCards: typeof raw.includeCards === 'boolean' ? raw.includeCards : true,
		srFlashcards: raw.srFlashcards === true,
			autoExport: typeof raw.autoExport === 'boolean' ? raw.autoExport : false,
			includeRawSrt: typeof raw.includeRawSrt === 'boolean' ? raw.includeRawSrt : false,
		};
	} catch {
		return { ...DEFAULT_OBSIDIAN_EXPORT_CONFIG };
	}
}

export async function saveObsidianExportConfig(config: ObsidianExportConfig): Promise<void> {
	await chromeLocalStorage.set({ [OBSIDIAN_EXPORT_STORAGE_KEY]: config });
}

export async function loadCreatedMocs(): Promise<string[]> {
	try {
		const items = await chromeLocalStorage.get([OBSIDIAN_CREATED_MOCS_KEY]);
		const list = items[OBSIDIAN_CREATED_MOCS_KEY];
		return Array.isArray(list) ? list.map(String) : [];
	} catch {
		return [];
	}
}

export async function saveCreatedMocs(slugs: string[]): Promise<void> {
	await chromeLocalStorage.set({ [OBSIDIAN_CREATED_MOCS_KEY]: slugs });
}

/**
 * Clave de una nota exportada: vault + ruta. Si cambias de vault o de carpeta,
 * la nota de ese destino aún no existe y se crea entera (no se le «añade» un
 * repaso a una nota que no está). Las claves viejas (<curso>---<leccion>, sin
 * vault) se siguen reconociendo.
 */
export function sessionExportKey(config: ObsidianExportConfig, courseName: string, lessonName: string): string {
	return `${config.vaultName.trim()}|${buildSessionNotePath(config, courseName, lessonName)}`;
}

export function isSessionExported(keys: string[], config: ObsidianExportConfig, courseName: string, lessonName: string): boolean {
	const legacy = `${slugifyVault(courseName)}---${slugifyVault(lessonName)}`;
	return keys.includes(sessionExportKey(config, courseName, lessonName)) || keys.includes(legacy);
}

export async function loadObsidianExportedNotes(): Promise<string[]> {
	try {
		const items = await chromeLocalStorage.get([OBSIDIAN_EXPORTED_NOTES_KEY]);
		const list = items[OBSIDIAN_EXPORTED_NOTES_KEY];
		return Array.isArray(list) ? list.map(String) : [];
	} catch {
		return [];
	}
}

export async function saveObsidianExportedNotes(keys: string[]): Promise<void> {
	await chromeLocalStorage.set({ [OBSIDIAN_EXPORTED_NOTES_KEY]: keys });
}

// ── Naming: kebab-case, sin tildes, minúsculas (convención del vault) ───────

export function slugifyVault(text: string, maxLen = 64): string {
	const stripped = String(text || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return stripped.slice(0, maxLen).replace(/-+$/g, '') || 'sin-nombre';
}

// ── HTML → Markdown ligero (para tarjetas y campos con HTML simple) ─────────

/**
 * C6: HTML → Markdown con fidelidad para la nota (reemplaza a
 * htmlToMarkdownLite en tarjetas): <pre><code class="language-x"> → bloque
 * cercado con su lenguaje; <table> → tabla Markdown; ol/ul → listas;
 * p/br → párrafos y saltos; callouts concept/tip/warning/interview-box →
 * citas con su etiqueta. Basado en regex sobre las formas que genera el
 * propio prompt (no hay HTML arbitrario de terceros).
 */
export function htmlToMarkdown(html: string): string {
	let s = String(html || '');
	// 1. Bloques de código cercados (el lenguaje viene en class="language-x").
	s = s.replace(/<pre[^>]*>\s*<code[^>]*class=["'][^"']*language-([a-z0-9+#]+)[^"']*["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
		(_m, lang: string, code: string) => `\n\n\`\`\`${String(lang).toLowerCase()}\n${decodeEntities(String(code).replace(/\n$/, ''))}\n\`\`\`\n\n`);
	s = s.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
		(_m, code: string) => `\n\n\`\`\`\n${decodeEntities(String(code).replace(/\n$/, ''))}\n\`\`\`\n\n`);
	// 2. Tablas: filas <tr>, cabecera <th>, celdas con inline ya convertido.
	s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_m, body: string) => {
		const rows: string[] = [];
		const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
		let tr: RegExpExecArray | null;
		while ((tr = trRe.exec(body)) !== null) {
			const cells: string[] = [];
			const tdRe = /<(th|td)[^>]*>([\s\S]*?)<\/(th|td)>/gi;
			let td: RegExpExecArray | null;
			while ((td = tdRe.exec(tr[1])) !== null) {
				cells.push(inlineToMarkdown(td[2]).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || ' ');
			}
			if (cells.length) rows.push(`| ${cells.join(' | ')} |`);
		}
		if (rows.length === 0) return '';
		const width = rows[0].split('|').length - 2;
		const divider = `| ${Array.from({ length: Math.max(width, 1) }, () => '---').join(' | ')} |`;
		return `\n\n${rows[0]}\n${divider}\n${rows.slice(1).join('\n')}\n\n`;
	});
	// 3. Listas.
	s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, body: string) => {
		let n = 0;
		const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
		let li: RegExpExecArray | null;
		const out: string[] = [];
		while ((li = liRe.exec(body)) !== null) {
			n += 1;
			out.push(`${n}. ${inlineToMarkdown(li[1]).trim()}`);
		}
		return `\n${out.join('\n')}\n`;
	});
	s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, body: string) => {
		const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
		let li: RegExpExecArray | null;
		const out: string[] = [];
		while ((li = liRe.exec(body)) !== null) out.push(`- ${inlineToMarkdown(li[1]).trim()}`);
		return `\n${out.join('\n')}\n`;
	});
	// 4. Callouts del prompt → citas con etiqueta. Los callouts anidan un
	//    <div class="label"> y pueden contener listas/tablas: un regex lazy
	//    cortaría en el PRIMER </div> y perdería el contenido — se recorre con
	//    balance de <div>/</div>.
	{
		const calloutRe = /<div class="(concept-box|tip-box|warning-box|interview-box)"[^>]*>/gi;
		const callouts: Array<{ kind: string; start: number; bodyStart: number; end: number }> = [];
		let cm: RegExpExecArray | null;
		while ((cm = calloutRe.exec(s)) !== null) {
			let depth = 1;
			let i = cm.index + cm[0].length;
			while (i < s.length && depth > 0) {
				const nextOpen = s.indexOf('<div', i);
				const nextClose = s.indexOf('</div>', i);
				if (nextClose === -1) { i = s.length; depth = 0; break; }
				if (nextOpen !== -1 && nextOpen < nextClose) { depth += 1; i = nextOpen + 4; }
				else { depth -= 1; i = nextClose + 6; }
			}
			callouts.push({ kind: cm[1], start: cm.index, bodyStart: cm.index + cm[0].length, end: Math.min(i, s.length) });
			calloutRe.lastIndex = Math.min(i, s.length);
		}
		if (callouts.length > 0) {
			let out = '';
			let last = 0;
			for (const c of callouts) {
				out += s.slice(last, c.start);
				const rawBody = s.slice(c.bodyStart, Math.max(c.bodyStart, c.end - 6));
				const labelMatch = rawBody.match(/<div class="label"[^>]*>([\s\S]*?)<\/div>/i);
				const label = (labelMatch ? decodeEntities(labelMatch[1]).replace(/<[^>]+>/g, '').trim() : '')
					|| (c.kind === 'concept-box' ? 'Concepto' : c.kind === 'tip-box' ? 'Tip' : c.kind === 'warning-box' ? 'Ojo' : 'Entrevista');
				const bodyClean = rawBody.replace(/<div class="label"[^>]*>[\s\S]*?<\/div>/i, '');
				const inner = inlineToMarkdown(bodyClean).trim();
				out += `\n> [!${c.kind === 'warning-box' ? 'warning' : 'info'}] ${label}\n> ${inner.split('\n').join('\n> ')}\n`;
				last = c.end;
			}
			out += s.slice(last);
			s = out;
		}
	}

// 5. Resto de bloques e inline.
	s = s.replace(/<p[^>]*>/gi, '\n').replace(/<\/(p|div|h[1-6])[^>]*>/gi, '\n')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/(b|strong)>/gi, '**$2**')
		.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '_$2_')
		.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
		.replace(/<[^>]+>/g, '');
	return decodeEntities(s)
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function inlineToMarkdown(html: string): string {
	return htmlToMarkdown(html);
}

function decodeEntities(s: string): string {
	return String(s || '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'");
}

export function htmlToMarkdownLite(html: string): string {
	return String(html || '')
		.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_m, code: string) => `\`${String(code).trim()}\``)
		.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
		.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/(b|strong)>/gi, '**$2**')
		.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '_$2_')
		.replace(/<br\s*\/?>/gi, ' / ')
		.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
		.replace(/<li[^>]*>/gi, '· ')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/[ \t]+/g, ' ')
		.trim();
}

function yamlEscape(value: string): string {
	return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function todayIso(today?: Date): string {
	const d = today ?? new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Nota de sesión ───────────────────────────────────────────────────────────

export function buildSessionNotePath(config: ObsidianExportConfig, courseName: string, lessonName: string): string {
	const course = slugifyVault(courseName);
	const lesson = slugifyVault(lessonName);
	const folder = config.sourcesFolder.replace(/^\/+|\/+$/g, '') || DEFAULT_OBSIDIAN_EXPORT_CONFIG.sourcesFolder;
	return `${folder}/${course}---${lesson}.md`;
}

export function buildSessionNoteMarkdown(
	data: ObsidianSessionData,
	config: ObsidianExportConfig,
	options: { today?: Date } = {},
): string {
	const course = slugifyVault(data.courseName);
	const platform = slugifyVault(data.platform || 'curso', 24);
	const c = data.content;
	const date = todayIso(options.today);
	const lines: string[] = [];

	lines.push('---');
	lines.push(`title: ${yamlEscape(`${data.lessonName} — ${data.courseName}`)}`);
	lines.push(`date: ${date}`);
	lines.push('type: sesion');
	lines.push(`platform: ${platform}`);
	lines.push(`course: ${course}`);
	lines.push(`lesson: ${yamlEscape(data.lessonName)}`);
	if (data.objective) lines.push(`objective: ${yamlEscape(data.objective)}`);
	// score < 0 = sin estimación (plantilla local): no se inventa una cifra.
	const relScore = Math.round(Number(c.relevance?.score));
	const hasRel = Number.isFinite(relScore) && relScore >= 0;
	if (hasRel) lines.push(`relevance_score: ${relScore}`);
	if (data.sourceUrl) lines.push(`lesson_url: ${yamlEscape(data.sourceUrl)}`);
	if (data.ankiDeck) lines.push(`anki_deck: ${yamlEscape(data.ankiDeck)}`);
	// Programa (career track): el MOC del programa filtra sus sesiones por
	// `programa_slug` con Dataview; sin programa, ninguna línea extra.
	if (data.program?.title) lines.push(`programa: ${yamlEscape(data.program.title)}`);
	if (data.program?.slug) lines.push(`programa_slug: ${data.program.slug}`);
	if (data.programs && data.programs.length > 0) lines.push(`programas: [${data.programs.map((s) => slugifyVault(s)).join(', ')}]`);
	// F2-2: concepts en el frontmatter (grafo entre cursos).
	const conceptTermsFront = (c as { conceptTerms?: string[] }).conceptTerms ?? [];
	if (conceptTermsFront.length > 0) lines.push(`concepts: [${conceptTermsFront.map((x) => slugifyVault(x)).join(', ')}]`);
	// C9: tags anidados de Obsidian (el MOC filtra por `course`, no por tag).
	lines.push(`tags: [kinema/sesion, kinema/curso/${course}, ${platform}]`);
	lines.push('---');
	lines.push('');
	lines.push(`# ${data.lessonName}`);
	lines.push('');
	lines.push(`Curso: [[${config.mocsFolder}/${course}|${data.courseName}]]`);
	// Enlace al MOC del programa (el fichero se crea con «MOC del programa»;
	// el enlace sin resolver es intencionado hasta que exista).
	if (data.program?.title && data.program?.slug) {
		lines.push(`Programa: [[${config.mocsFolder}/moc-${data.program.slug}|${data.program.title}]]`);
	}
	if (data.objective) lines.push(`Objetivo: ${data.objective}`);
	lines.push('');
	// C4: el Resumen es la síntesis generativa del prompt (con palabras
	// propias); la relevancia pasa a línea aparte. Sin summary (historial
	// viejo), la sección se llama «Relevancia» como antes.
	const summary = (c as { summary?: string }).summary;
	if (summary) {
		lines.push('## Resumen');
		lines.push('');
		lines.push(summary);
		lines.push('');
		if (hasRel) {
			lines.push(`> Relevancia para tu objetivo: ${relScore}/100 — ${c.relevance?.reason || ''}`);
			lines.push('');
		}
	} else {
		lines.push('## Relevancia');
		lines.push('');
		lines.push(hasRel ? `${c.relevance?.reason || ''} (relevancia ${relScore}/100 para el objetivo).` : (c.relevance?.reason || ''));
		lines.push('');
	}
	lines.push('## Ideas clave');
	lines.push('');
	// F2-1: si el content trae t por idea (keyConcepts como {text,t}), el
	// enlace salta al minuto. Retrocompatible: un string sigue siendo válido.
	(c.keyConcepts || []).forEach((k, i) => {
		const item = typeof k === 'string' ? { text: k, t: undefined } : (k as { text?: string; t?: string });
		const text = item.text || String(k);
		const url = data.sourceUrl && item.t && /^\d{1,2}:\d{2}$/.test(item.t)
			? `${data.sourceUrl.split('#')[0].split('?')[0]}?start=${Number(item.t.split(':')[0]) * 60 + Number(item.t.split(':')[1])}#overview`
			: null;
		const link = url ? ` — [▶ ${item.t}](${url})` : '';
		lines.push(`- ${text}${link}`);
	});
	lines.push('');
	// F2-2: conceptos enlazables (grafo entre cursos). Los enlaces sin resolver
	// son intencionados: el destilado del vault crea esas páginas.
	const conceptTerms = (c as { conceptTerms?: string[] }).conceptTerms ?? [];
	if (conceptTerms.length > 0) {
		lines.push(`Conceptos: ${conceptTerms.map((term) => `[[wiki/conceptos/${slugifyVault(term)}|${term}]]`).join(' · ')}`);
		lines.push('');
	}
	if ((c.questions || []).length > 0) {
		lines.push('## Preguntas para comprobarte');
		lines.push('');
		// C5: autoevaluación real — cada pregunta es un callout PLEGADO con la
		// pista y la respuesta dentro (recuperación antes que relectura). Una por
		// idea clave + síntesis, como en Comprobar; sin la dificultad interna
		// (confused/partial…), que no significa nada fuera de la app.
		c.questions.forEach((q) => {
			lines.push(`> [!question]- ${q.q}${q.bloom ? ` _(${bloomTaskLabel(q.bloom)})_` : ''}`);
			if (q.hint) lines.push(`> _Pista:_ ${q.hint}`);
			if (q.answer) lines.push(`> **Respuesta:** ${q.answer}`);
			lines.push('');
		});
	}
	if (c.interviewQ?.q) {
		lines.push('## Práctica oral');
		lines.push('');
		// C5: la estructura ideal va plegada — primero responde en voz alta.
		lines.push(`> [!question]- ${c.interviewQ.q}`);
		if (c.interviewQ.idealAnswer) {
			// La IA a veces ya escribe «Estructura ideal: …»: no duplicar la etiqueta.
			const ideal = c.interviewQ.idealAnswer;
			lines.push(/^\s*(\*\*\s*)?estructura ideal\b/i.test(ideal) ? `> ${ideal}` : `> **Estructura ideal:** ${ideal}`);
		}
		lines.push('');
	}
	if (c.application?.setup || c.application?.challenge) {
		lines.push('## Aplicación práctica');
		lines.push('');
		if (c.application.setup) lines.push(`**Escenario:** ${c.application.setup}`, '');
		if (c.application.challenge) lines.push(`**Reto:** ${c.application.challenge}`, '');
		if (c.application.solution) {
			// C5: la solución va plegada.
			lines.push(`> [!example]- Ver solución`);
			lines.push(`> ${c.application.solution}`);
			lines.push('');
		}
	}
	if (c.nextAction) {
		lines.push('## Próximo paso');
		lines.push('');
		lines.push(`- [ ] ${c.nextAction}`);
		lines.push('');
	}
	lines.push(...sessionOutcomeLines(data, '##'));
	if (config.includeCards && (c.ankiCards || []).length > 0) {
		// C6: por defecto, referencia plegada bien formateada y SIN #flashcards —
		// un solo planificador (Anki). «Repasar también en Obsidian» activa el
		// formato multilínea del plugin Spaced Repetition bajo #flashcards.
		if (config.srFlashcards) {
			lines.push('## Tarjetas de la lección');
			lines.push('');
			lines.push('#flashcards');
			lines.push('');
			c.ankiCards.forEach((card) => {
				const front = htmlToMarkdown(card.front);
				const back = htmlToMarkdown(card.back);
				if (front && back) lines.push(`${front}\n?\n${back}\n`);
			});
			lines.push('> [!info] El mazo con formato dev-card se exporta desde la extensión como `.apkg`.');
			lines.push('');
		} else {
			lines.push(`> [!example]- Tarjetas de esta lección (${c.ankiCards.length}) · repásalas en Anki`);
			// Cada línea con «> »: un reverso multilínea (código, o respuesta + cita
			// de una tarjeta de duda) no debe salirse del callout plegado.
			const inCallout = (text: string) => text.split('\n').map((line) => (line.trim() ? `> ${line}` : '>'));
			c.ankiCards.forEach((card) => {
				const front = htmlToMarkdown(card.front);
				const back = htmlToMarkdown(card.back);
				if (front && back) {
					const [head, ...tail] = front.split('\n');
					lines.push(`> **${head}**`, ...(tail.length ? inCallout(tail.join('\n')) : []));
					lines.push(...inCallout(back));
					lines.push('>');
				}
			});
			lines.push('');
			lines.push('> [!info] El mazo con formato dev-card se exporta desde la extensión como `.apkg`.');
			lines.push('');
		}
	}
	return lines.join('\n');
}

/**
 * Lo que cambia de una sesión a otra: resultado, recuerdo libre, puntos a
 * reforzar y dudas. Va en la nota completa (##) y en cada «Repaso» que se
 * añade al final de una nota ya exportada (###).
 */
function sessionOutcomeLines(data: ObsidianSessionData, h: '##' | '###'): string[] {
	const lines: string[] = [];
	// flowVersion 2: el cierre de Study viaja a la nota — resultado, recuerdo
	// libre y puntos a reforzar, antes de las tarjetas.
	if (data.result) {
		const r = data.result;
		lines.push(`${h} Resultado de la sesión`);
		lines.push('');
		lines.push(`**${r.title}**`);
		lines.push('');
		const parts = [
			`Recordaste (según tú): ${r.remembered.count} de ${r.remembered.total} ideas`,
			r.check.skipped
				? 'Comprobación: saltada'
				: `Comprobación: ${r.check.firstTry} a la primera${r.check.improved ? ` · ${r.check.improved} tras corregir` : ''}`,
			`Práctica: ${r.practice === 'correct' ? 'correcta' : r.practice === 'done' ? 'hecha' : 'pendiente'}`,
			`Tarjetas: ${r.cards.total} (${r.cards.reinforce} de refuerzo${r.cards.doubt ? `, ${r.cards.doubt} de duda` : ''}) · ${r.cards.destination === 'anki' ? 'en Anki' : r.cards.destination === 'obsidian' ? 'en Obsidian' : 'sin exportar'}`,
		];
		parts.forEach((p) => lines.push(`- ${p}`));
		if (r.calibration) {
			lines.push('');
			// El mensaje ya nombra el nivel elegido y el demostrado (solo hay calibración con respuestas).
			lines.push(`> [!info] Calibración: ${r.calibration.message}`);
		}
		lines.push('');
	}
	if (data.recallNotes?.trim()) {
		lines.push(`${h} Lo que recordé sin mirar`);
		lines.push('');
		lines.push(data.recallNotes.trim());
		lines.push('');
	}
	const unrecalled = data.unrecalledIdeas || [];
	if ((data.weakPoints || []).length > 0 || unrecalled.length > 0 || data.practiceToRedo) {
		// Lo mismo que Anki refuerza: ideas no recordadas, preguntas falladas y la práctica.
		lines.push(`${h} Puntos a reforzar`);
		lines.push('');
		if (unrecalled.length > 0) {
			lines.push('No me salieron sin mirar:');
			unrecalled.forEach((idea) => lines.push(`- ${idea}`));
			lines.push('');
		}
		if (data.practiceToRedo) {
			lines.push('- Repetir la práctica sin mirar la solución (ver «Aplicación práctica»).');
			lines.push('');
		}
		// C5: la respuesta correcta va plegada — primero intenta recordar.
		(data.weakPoints || []).forEach((w) => {
			lines.push(`> [!question]- ${w.q}`);
			lines.push(`> **Respuesta:** ${w.answer}`);
			lines.push('');
		});
	}
	if ((data.doubts || []).length > 0) {
		lines.push(`${h} Dudas resueltas`);
		lines.push('');
		// §5: mismo patrón plegado que «Puntos a reforzar»: la duda a la vista,
		// la respuesta (y su respaldo literal en la transcripción) plegada.
		data.doubts!.forEach((d) => {
			lines.push(`> [!question]- ${d.t ? `(${d.t}) ` : ''}${d.q.replace(/\s*\n\s*/g, ' ')}`);
			lines.push(`> ${d.outside ? '**Fuera de la lección.** ' : ''}${d.answer.replace(/\s*\n\s*/g, ' ')}`);
			d.quotes.forEach((quote) => lines.push(`> > «${quote}»`));
			lines.push('');
		});
	}
	return lines;
}

/**
 * Repaso para AÑADIR al final de una nota ya exportada (obsidian://new con
 * append): suma el resultado de hoy sin tocar lo que el estudiante escribió.
 */
export function buildSessionUpdateMarkdown(data: ObsidianSessionData, options: { today?: Date } = {}): string {
	return [`## Repaso · ${todayIso(options.today)}`, '', ...sessionOutcomeLines(data, '###')].join('\n');
}

// ── MOC del curso (índice automático con Dataview) ──────────────────────────

export function buildCourseMocPath(config: ObsidianExportConfig, courseName: string): string {
	const folder = config.mocsFolder.replace(/^\/+|\/+$/g, '') || DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder;
	return `${folder}/${slugifyVault(courseName)}.md`;
}

export function buildCourseMocMarkdown(
	courseName: string,
	options: { platform?: string; objective?: string; today?: Date; sourcesFolder?: string } = {},
): string {
	const course = slugifyVault(courseName);
	const platform = slugifyVault(options.platform || 'curso', 24);
	// C1: la consulta respeta la carpeta configurada (antes iba fija a
	// "wiki/fuentes" y el índice salía vacío con carpetas personalizadas).
	const sourcesFolderPlaceholder = (options.sourcesFolder || '').replace(/^\/+|\/+$/g, '') || 'wiki/fuentes';
	const lines: string[] = [];
	lines.push('---');
	lines.push(`title: ${yamlEscape(courseName)}`);
	lines.push(`date: ${todayIso(options.today)}`);
	lines.push('type: curso');
	lines.push(`platform: ${platform}`);
	lines.push('status: en-progreso');
	lines.push(`tags: [curso, ${platform}, ${course}]`);
	lines.push('---');
	lines.push('');
	lines.push(`# ${courseName}`);
	lines.push('');
	if (options.objective) lines.push(`**Objetivo:** ${options.objective}`, '');
	lines.push('> [!tip] Las sesiones se listan solas: cada exportación de la extensión');
	lines.push('> crea una nota en `' + sourcesFolderPlaceholder + '` con `course: ' + course + '` en el frontmatter.');
	lines.push('');
	lines.push('## Sesiones');
	lines.push('');
	lines.push('```dataview');
	lines.push('TABLE lesson AS "Lección", date AS "Fecha", relevance_score AS "Relevancia"');
	lines.push(`FROM "${sourcesFolderPlaceholder}"`);
	lines.push(`WHERE course = "${course}"`);
	lines.push('SORT date DESC');
	lines.push('```');
	lines.push('');
	lines.push('## Progreso');
	lines.push('');
	lines.push('- [ ] Terminar todas las lecciones planificadas');
	lines.push('- [ ] Destilar conceptos clave → [[wiki/conceptos/]]');
	lines.push('');
	lines.push('## Conceptos del curso');
	lines.push('');
	lines.push('- (destilado supervisado: enlazar aquí [[wiki/conceptos/...]])');
	lines.push('');
	return lines.join('\n');
}

export function buildProgramMocPath(config: ObsidianExportConfig, programTitle: string, programSlug: string): string {
	const folder = config.mocsFolder.replace(/^\/+|\/+$/g, '') || DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder;
	return `${folder}/moc-${slugifyVault(programSlug)}.md`;
}

/** Lo mínimo que el MOC necesita del programa (estructural: sin importar el adaptador del sitio). */
export interface ObsidianProgramData {
	title: string;
	slug: string;
	description?: string;
	timeNeeded?: string;
	completionRate?: number | null;
	enrolled?: boolean | null;
	courses: Array<{ title: string; slug: string; position: number; done: boolean | null }>;
	platform?: string;
}

/**
 * MOC del programa (career track): los cursos EN ORDEN con su estado según la
 * propia plataforma, y las sesiones estudiadas (Dataview por `programa_slug`).
 * Un curso puede estar en varios programas: por eso el programa es una nota
 * índice, no carpetas ni mazos — nada se mueve ni se duplica.
 */
export function buildProgramMocMarkdown(
	program: ObsidianProgramData,
	options: { today?: Date; sourcesFolder?: string; mocsFolder?: string } = {},
): string {
	const sourcesFolderPlaceholder = (options.sourcesFolder || '').replace(/^\/+|\/+$/g, '') || 'wiki/fuentes';
	const mocsFolderPlaceholder = (options.mocsFolder || '').replace(/^\/+|\/+$/g, '') || DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder;
	const platform = slugifyVault(program.platform || 'datacamp', 24);
	const lines: string[] = [];
	lines.push('---');
	lines.push(`title: ${yamlEscape(program.title)}`);
	lines.push(`date: ${todayIso(options.today)}`);
	lines.push('type: programa');
	lines.push(`platform: ${platform}`);
	lines.push(`programa_slug: ${program.slug}`);
	lines.push('status: en-progreso');
	lines.push(`tags: [programa, ${platform}, ${slugifyVault(program.slug)}]`);
	lines.push('---');
	lines.push('');
	lines.push(`# ${program.title}`);
	lines.push('');
	if (program.description) lines.push(program.description, '');
	const pct = typeof program.completionRate === 'number' ? Math.round(program.completionRate * 100) : null;
	const meta: string[] = [];
	if (program.timeNeeded) meta.push(`Tiempo estimado: **${program.timeNeeded}**`);
	if (pct !== null) meta.push(`Progreso en la plataforma: **${pct}%**`);
	if (program.enrolled !== null) meta.push(program.enrolled ? 'Inscrito' : 'No inscrito');
	if (meta.length > 0) lines.push(`> [!info] ${meta.join(' · ')}`, '');
	lines.push('## Cursos (en orden)');
	lines.push('');
	lines.push('| # | Curso | Estado |');
	lines.push('|---|---|---|');
	program.courses.forEach((c, index) => {
		const state = c.done === true ? '✅ completado' : c.done === false ? '⬜ pendiente' : '— sin dato';
		// Mismo convenio que el MOC de curso: el enlace vive en la carpeta de MOCs.
		lines.push(`| ${index + 1} | [[${mocsFolderPlaceholder}/${slugifyVault(c.title)}|${c.title}]] | ${state} |`);
	});
	lines.push('');
	lines.push('## Sesiones estudiadas con Kinema');
	lines.push('');
	lines.push('```dataview');
	lines.push('TABLE lesson AS "Lección", course AS "Curso", date AS "Fecha"');
	lines.push(`FROM "${sourcesFolderPlaceholder}"`);
	lines.push(`WHERE contains(programas, "${program.slug}") OR programa_slug = "${program.slug}"`);
	lines.push('SORT date DESC');
	lines.push('```');
	lines.push('');
	lines.push('> [!tip] Las sesiones llevan `programa_slug: ' + program.slug + '` en el frontmatter');
	lines.push('> cuando el programa está elegido en el dock.');
	lines.push('');
	return lines.join('\n');
}

// ── Material crudo (raw/): SRT de la lección como nota inmutable ────────────

export function buildRawSrtNotePath(courseName: string, lessonName: string, options: { platform?: string } = {}): string {
	const platform = slugifyVault(options.platform || 'udemy', 24);
	const course = slugifyVault(courseName);
	const lesson = slugifyVault(lessonName);
	return `raw/${platform}/${course}/${course}---${lesson}.md`;
}

export function buildRawSrtNoteMarkdown(
	courseName: string,
	lessonName: string,
	srt: string,
	options: { platform?: string; sourceUrl?: string; today?: Date } = {},
): string {
	const course = slugifyVault(courseName);
	const platform = slugifyVault(options.platform || 'udemy', 24);
	const lines: string[] = [];
	lines.push('---');
	lines.push(`title: ${yamlEscape(`SRT EN — ${lessonName}`)}`);
	lines.push(`date: ${todayIso(options.today)}`);
	lines.push('type: raw-srt');
	lines.push(`platform: ${platform}`);
	lines.push(`course: ${course}`);
	lines.push(`lesson: ${yamlEscape(lessonName)}`);
	if (options.sourceUrl) lines.push(`lesson_url: ${yamlEscape(options.sourceUrl)}`);
	lines.push(`tags: [${platform}, raw, srt, ${course}]`);
	lines.push('---');
	lines.push('');
	lines.push('> [!warning] Material crudo INMUTABLE (`raw/`). Fuente de verdad de la sesión;');
	lines.push('> ni la extensión ni los agentes lo modifican. La sesión destilada vive en `wiki/fuentes/`.');
	lines.push('');
	lines.push('```srt');
	lines.push(String(srt || '').trim());
	lines.push('```');
	lines.push('');
	return lines.join('\n');
}

// ── Scaffold: crear el vault desde cero ─────────────────────────────────────

export function buildScaffoldNotes(options: { platform?: string } = {}): VaultNote[] {
	const platform = slugifyVault(options.platform || 'curso', 24);
	const claudemd = [
		'# Wiki Schema (aprendizaje universal)',
		'',
		'> Este esquema está espejado en `AGENTS.md` para agentes que no leen CLAUDE.md.',
		'> Si editas uno, copia el cambio al otro.',
		'',
		'## Dominio',
		'Cualquier aprendizaje: cursos de cualquier plataforma (Udemy, YouTube, Coursera…), libros, artículos, habilidades personales.',
		'',
		'## Estructura de carpetas',
		'- `raw/<fuente>/<curso>/` — material bruto INMUTABLE (transcripciones .srt como nota .md, PDFs, capturas). El LLM lee pero nunca modifica. La extensión puede crearlos (opción «Subtítulos originales»).',
		'- `cursos/` — un MOC (Map of Content) por curso/tema, con índice automático Dataview de sus sesiones.',
		'- `wiki/fuentes/` — UNA nota por sesión o recurso consumido (la extensión exporta aquí).',
		'- `wiki/entidades/` — personas, organizaciones, productos, tecnologías.',
		'- `wiki/conceptos/` — ideas y conceptos destilados, con enlaces a todas las fuentes que los mencionan.',
		'- `wiki/sintesis/` — comparaciones y análisis que cruzan fuentes.',
		'- `plantillas/` — plantillas de nota (sesión, curso, concepto).',
		'- `index.md` — catálogo. `log.md` — registro cronológico de operaciones.',
		'',
		'## Formato de nota de sesión (wiki/fuentes/)',
		'Frontmatter: title, date, type: sesion, platform, course, lesson, objective, relevance_score, lesson_url, anki_deck, concepts, tags (kinema/sesion, kinema/curso/<curso>).',
		'Secciones: Resumen, Ideas clave, Preguntas para comprobarte, Práctica oral, Aplicación práctica, Próximo paso, Resultado de la sesión, Lo que recordé sin mirar, Puntos a reforzar, Dudas resueltas y las tarjetas de la lección (referencia plegada; con «Repasar también en Obsidian», formato multilínea del plugin Spaced Repetition bajo #flashcards). Cada nueva sesión de la misma lección AÑADE al final un «## Repaso · fecha» (la nota no se reescribe).',
		'',
		'## Formato de MOC de curso (cursos/)',
		'Frontmatter: title, date, type: curso, platform, status, tags. Secciones: Sesiones (query Dataview por `course`), Progreso, Conceptos del curso.',
		'',
		'## Naming',
		'- Filenames kebab-case, en español, sin tildes, minúsculas: `aprendizaje-activo.md`.',
		'- Sesiones: `wiki/fuentes/<curso>---<leccion>.md`.',
		'- Títulos H1 con tildes y mayúsculas apropiadas.',
		'',
		'## Log',
		'`## [YYYY-MM-DD] operacion | Detalle` — tipos: init, export, ingest, query, lint, update.',
		'',
		'## Workflow',
		'1. Consumir la lección/recursos con la extensión → exportar a Obsidian (nota de sesión + MOC automático).',
		'2. Ingestión supervisada (una fuente a la vez): de las sesiones → páginas de concepto/entidad con enlaces.',
		'3. Síntesis cuando haya 2+ fuentes que se crucen.',
	].join('\n');

	const index = [
		'# Índice de la Wiki',
		'',
		`Última actualización: ${todayIso()} | Total páginas: 0`,
		'',
		'## Cursos (0)',
		'| Pagina | Plataforma | Estado |',
		'|--------|------------|--------|',
		'',
		'## Fuentes (0)',
		'| Pagina | Resumen | Fecha | Tags |',
		'|--------|---------|-------|------|',
		'',
		'## Conceptos (0)',
		'| Pagina | Resumen breve | Fuentes |',
		'|--------|---------------|---------|',
		'',
		'## Síntesis (0)',
		'| Pagina | Origen | Fecha |',
		'|--------|--------|-------|',
		'',
	].join('\n');

	const log = [
		'# Log de Operaciones',
		'',
		'<!-- Formato: ## [YYYY-MM-DD] operacion | Detalle -->',
		'<!-- Parseable: grep "^## \\[" log.md | tail -10 -->',
		'',
		`## [${todayIso()}] init | Vault creado desde Kinema`,
		'- Estructura de carpetas + CLAUDE.md + index.md + plantillas creados',
		'- Dominio: aprendizaje universal (cursos, libros, habilidades)',
	].join('\n');

	// Mismo esquema que la nota que exporta Kinema (buildSessionNoteMarkdown).
	const plantillaSesion = [
		'---',
		'title: "Lección — Curso"',
		`date: ${todayIso()}`,
		'type: sesion',
		`platform: ${platform}`,
		'course: slug-del-curso',
		'lesson: "Nombre de la lección"',
		'objective: "Para qué estudio esto"',
		'relevance_score: 0',
		'lesson_url: ""',
		`tags: [kinema/sesion, kinema/curso/slug-del-curso, ${platform}]`,
		'---',
		'',
		'# Nombre de la lección',
		'',
		'Curso: [[cursos/slug-del-curso|Nombre del curso]]',
		'',
		'## Resumen',
		'',
		'## Ideas clave',
		'',
		'- ',
		'',
		'## Preguntas para comprobarte',
		'',
		'> [!question]- ¿Pregunta? _(qué pide: definir, explicar, usar en un caso…)_',
		'> _Pista:_ ',
		'> **Respuesta:** ',
		'',
		'## Aplicación práctica',
		'',
		'**Escenario:** ',
		'',
		'**Reto:** ',
		'',
		'> [!example]- Ver solución',
		'> ',
		'',
		'## Próximo paso',
		'',
		'- [ ] ',
		'',
		'## Puntos a reforzar',
		'',
		'- ',
		'',
	].join('\n');

	const plantillaCurso = [
		'---',
		'title: "Nombre del curso"',
		`date: ${todayIso()}`,
		'type: curso',
		`platform: ${platform}`,
		'status: en-progreso',
		`tags: [curso, ${platform}]`,
		'---',
		'',
		'# Nombre del curso',
		'',
		'**Objetivo:** ',
		'',
		'## Sesiones',
		'',
		'```dataview',
		'TABLE lesson AS "Lección", date AS "Fecha", relevance_score AS "Relevancia"',
		'FROM "wiki/fuentes"',
		'WHERE course = "slug-del-curso"',
		'SORT date DESC',
		'```',
		'',
		'## Progreso',
		'',
		'- [ ] ',
		'',
		'## Conceptos del curso',
		'',
		'- ',
		'',
	].join('\n');

	const plantillaConcepto = [
		'---',
		'title: "Nombre del concepto"',
		'tags: []',
		'source_count: 1',
		'---',
		'',
		'# Nombre del concepto',
		'',
		'## Definición',
		'',
		'## Fuentes que lo mencionan',
		'',
		'- [[wiki/fuentes/...]]',
		'',
		'## Perspectivas distintas',
		'',
		'## Contradicciones detectadas',
		'',
	].join('\n');

	// AGENTS.md: espejo del esquema para agentes que no leen CLAUDE.md
	// (Codex, Cursor, Jules, ZCode...). Se copia con el puntero invertido.
	const agentsmd = claudemd.replace(
		'> Este esquema está espejado en `AGENTS.md` para agentes que no leen CLAUDE.md.\n> Si editas uno, copia el cambio al otro.',
		'> Espejo de `CLAUDE.md` (mismo esquema y convenciones). Si editas uno, copia el cambio al otro.',
	);

	return [
		{ path: 'CLAUDE.md', markdown: claudemd },
		{ path: 'AGENTS.md', markdown: agentsmd },
		{ path: 'index.md', markdown: index },
		{ path: 'log.md', markdown: log },
		{ path: 'plantillas/sesion.md', markdown: plantillaSesion },
		{ path: 'plantillas/curso-moc.md', markdown: plantillaCurso },
		{ path: 'plantillas/concepto.md', markdown: plantillaConcepto },
	];
}

// ── URI scheme nativo de Obsidian ───────────────────────────────────────────

export function buildObsidianNewUri(
	vaultName: string,
	note: VaultNote,
	options: { overwrite?: boolean; append?: boolean; clipboard?: boolean } = {},
): string {
	// encodeURIComponent (no URLSearchParams): Obsidian espera %20 para los
	// espacios en los query params del scheme obsidian://.
	let uri = `obsidian://new?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(note.path)}`;
	// append: añade al final de la nota existente (sin tocar lo escrito);
	// overwrite: la rehace entera. Obsidian ignora overwrite si hay append.
	if (options.append) uri += '&append=true';
	else if (options.overwrite) uri += '&overwrite=true';
	if (options.clipboard) uri += '&clipboard=true';
	else uri += `&content=${encodeURIComponent(note.markdown)}`;
	return uri;
}

/** Umbral C8: por encima, la URI es demasiado larga para el scheme. */
const OBSIDIAN_URI_LIMIT = 30_000;

/**
 * C8: abre la nota; si la URI codificada pasa de 30 000 caracteres (SRT crudo
 * de una lección larga), escribe el markdown en el portapapeles y abre con
 * clipboard=true — Obsidian toma el contenido del portapapeles.
 */
export function openObsidianNote(vaultName: string, note: VaultNote, options: { overwrite?: boolean; append?: boolean } = {}): void {
	const encodedLength = encodeURIComponent(note.markdown).length;
	if (encodedLength > OBSIDIAN_URI_LIMIT) {
		try {
			// El export corre dentro del gesto del clic: execCommand es la única
			// copia síncrona fiable aquí (clipboard API async perdería el gesto).
			const helper = document.createElement('textarea');
			helper.value = note.markdown;
			helper.style.position = 'fixed';
			helper.style.opacity = '0';
			document.body.appendChild(helper);
			helper.select();
			document.execCommand('copy');
			helper.remove();
		} catch {
			/* sin portapapeles: la URI larga igual se intenta */
		}
		openObsidianUri(buildObsidianNewUri(vaultName, note, { ...options, clipboard: true }));
		return;
	}
	openObsidianUri(buildObsidianNewUri(vaultName, note, options));
}

export function buildObsidianOpenVaultUri(vaultName: string): string {
	return `obsidian://open?vault=${encodeURIComponent(vaultName)}`;
}

/**
 * Abre una URI obsidian:// desde la página. Los protocolos externos no
 * navegan la página: Chrome muestra su diálogo "Abrir Obsidian?" y lanza la
 * app. Devuelve true si el navegador aceptó el intento.
 */
export function openObsidianUri(uri: string): boolean {
	try {
		const anchor = document.createElement('a');
		anchor.href = uri;
		anchor.style.display = 'none';
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		return true;
	} catch {
		return false;
	}
}

/**
 * Exporta la sesión: crea (una vez por curso) el MOC y luego la nota.
 * Devuelve las rutas escritas para el toast de confirmación.
 */
export function exportSessionToObsidian(
	data: ObsidianSessionData,
	config: ObsidianExportConfig,
	orchestration: {
		createdMocs: string[];
		today?: Date;
		/** C7: «Reemplazar nota» — true solo en el reemplazo explícito. */
		overwrite?: boolean;
	},
): { notePath: string; moc: { note: VaultNote; key: string } | null } {
	if (!config.vaultName.trim()) {
		throw new Error('Configura el nombre del vault en Ajustes antes de exportar.');
	}
	const vault = config.vaultName.trim();
	const courseSlug = slugifyVault(data.courseName);
	// C2: el MOC se crea UNA VEZ POR VAULT — la clave incluye el vault. Las
	// entradas viejas sin «|» (de antes de este cambio) se asignan al vault
	// actual para no recrear MOCs al migrar.
	const mocKey = `${vault}|${courseSlug}`;
	const knownMocs = orchestration.createdMocs.map((m) => (m.includes('|') ? m : `${vault}|${m}`));
	// El índice del curso NO se abre aquí (una URI por clic): se devuelve para
	// ofrecerlo como acción aparte; el llamador lo marca creado al abrirlo.
	const moc = knownMocs.includes(mocKey) ? null : {
		key: mocKey,
		note: {
			path: buildCourseMocPath(config, data.courseName),
			markdown: buildCourseMocMarkdown(data.courseName, {
				platform: data.platform,
				objective: data.objective,
				today: orchestration.today,
				sourcesFolder: config.sourcesFolder, // C1
			}),
		},
	};
	const note: VaultNote = {
		path: buildSessionNotePath(config, data.courseName, data.lessonName),
		markdown: buildSessionNoteMarkdown(data, config, { today: orchestration.today }),
	};
	// C7: overwrite=true SOLO en «Reemplazar nota» (el usuario pide pisar la
	// nota en vez de crear "nombre 1.md").
	openObsidianNote(vault, note, { overwrite: orchestration.overwrite });
	return { notePath: note.path, moc };
}

/**
 * Añade un «Repaso · fecha» al final de la nota ya exportada (append): el
 * vault crece con el resultado de cada sesión y lo que escribiste no se toca.
 */
export function exportSessionUpdateToObsidian(
	data: ObsidianSessionData,
	config: ObsidianExportConfig,
	options: { today?: Date } = {},
): { notePath: string } {
	if (!config.vaultName.trim()) {
		throw new Error('Configura el nombre del vault en Ajustes antes de exportar.');
	}
	const note: VaultNote = {
		path: buildSessionNotePath(config, data.courseName, data.lessonName),
		markdown: buildSessionUpdateMarkdown(data, options),
	};
	openObsidianNote(config.vaultName.trim(), note, { append: true });
	return { notePath: note.path };
}

/**
 * Estructura completa del vault (CLAUDE.md, index, log, plantillas y las
 * carpetas configuradas) para empaquetar en un .zip: abrir 7 URIs seguidas no
 * funciona (Chrome solo deja una por clic) y obsidian://new no crea carpetas vacías.
 */
export function buildVaultScaffold(config: ObsidianExportConfig, options: { platform?: string } = {}): { notes: VaultNote[]; folders: string[] } {
	const clean = (folder: string, fallback: string) => folder.replace(/^\/+|\/+$/g, '') || fallback;
	const platform = slugifyVault(options.platform || 'curso', 24);
	return {
		notes: buildScaffoldNotes({ platform: options.platform }),
		folders: [
			clean(config.sourcesFolder, DEFAULT_OBSIDIAN_EXPORT_CONFIG.sourcesFolder),
			clean(config.mocsFolder, DEFAULT_OBSIDIAN_EXPORT_CONFIG.mocsFolder),
			`raw/${platform}`,
			'wiki/conceptos',
			'wiki/entidades',
			'wiki/sintesis',
		],
	};
}
