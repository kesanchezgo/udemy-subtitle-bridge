/**
 * Fase 4 · ¿Esta idea ya está en tu mazo? — control de duplicados de conceptos.
 *
 * El GUID de una tarjeta es curso|lección|[study:|duda:]frente: la MISMA idea
 * estudiada en otra lección (un repaso, una introducción que adelanta temas,
 * la misma lección estudiada otra vez, otro curso del mismo programa) entraba
 * en Anki como una nota nueva. Dos tarjetas de la misma idea reparten su
 * memoria en dos calendarios y la duplican en la cola.
 *
 * Sin similitud léxica (medido con las 26 tarjetas reales del repo: ningún
 * par ≥ 40 % de Jaccard y los pares legítimos entre el 10 y el 23 %). La
 * identidad sale de lo que ya es identidad, con más cautela cuanto más lejos:
 *
 *   alcance                     mismo frente   mismo título   IA (ids enviados)
 *   esta lección (otra sesión)       sí             sí              sí
 *   este curso                       sí             sí              sí
 *   su programa (DataCamp)           sí             sí              sí
 *   otro curso tuyo                  no             no              sí
 *
 * Entre cursos sin relación, una pregunta corta o un título («Qué es un hook»)
 * puede ser otra cosa en otro dominio: ahí solo decide la IA, que ve de qué
 * curso es cada tarjeta, y solo se le enseñan las que comparten un nombre
 * canónico con la lección. conceptTerms, el código de los frentes y las
 * etiquetas kinema::tema solo deciden QUÉ tarjetas se enseñan a la IA, nunca
 * si dos tarjetas son la misma.
 *
 * La misma lección estudiada otra vez también cuenta: el mismo frente puede
 * llevar otro GUID (una tarjeta de cobertura o de duda lleva prefijo), así que
 * volver a exportarla podría duplicarla; y si es la misma nota, dejarla fuera
 * no cambia nada en Anki.
 *
 * Fuente: con Anki conectado, el mazo real (findNotes + notesInfo, solo
 * lectura: las del curso y las demás de conceptos de Kinema); sin Anki, lo
 * exportado según el historial de este navegador.
 * El resultado se guarda con la sesión (deckMatches): al restaurar no se
 * recalcula (después de exportar, las tarjetas de esta misma lección ya
 * estarían en el mazo y todo parecería repetido).
 *
 * Pura: sin chrome ni React (los tests la importan desde Node).
 */
import { frontKey, isStudyCard } from './cardCoverage.ts';
import { splitIdea } from './recallCue.ts';
import { kinemaSlug, programsInTags, sanitizeDeckSegment } from './ankiDesign.ts';
import { DECK_IDEAS_LIMIT } from '../../shared/prompts.ts';

export type DeckSource = 'anki' | 'historial';
export type DeckMatchVia = 'frente' | 'titulo' | 'ia';

/** Una tarjeta de conceptos que ya está en el mazo. */
export interface DeckConcept {
	/** Frente en texto plano (sin HTML), recortado. */
	front: string;
	/** frontKey del frente: la identidad exacta de la tarjeta. */
	key: string;
	/** Títulos de las ideas que evalúa (solo si el historial los conoce). */
	titles: string[];
	/** Nombres canónicos: conceptTerms de su lección, lo que va en <code> del frente y kinema::tema. */
	terms: string[];
	lesson: string;
	/** kinemaSlug de la lección (el de la etiqueta kinema::leccion). */
	lessonKey: string;
	/** kinemaSlug del curso (el de la etiqueta kinema::curso); '' si no consta. */
	courseKey: string;
	/** Nombre del curso, si se conoce (historial o registro de mazos). */
	course: string;
	/** Programas (kinema::programa, o kinema::track en notas antiguas) con los que se envió. */
	tracks: string[];
	/** Nota de Anki (solo si viene de Anki). */
	noteId?: number;
	/** Recencia (ms): id de la nota en Anki (es su fecha de creación) o exportedAt. */
	at: number;
}

export interface DeckIndex {
	source: DeckSource;
	entries: DeckConcept[];
}

/** Lo que se le enseñó a la IA (se guarda con la pre-generación para validar sus ids). */
export interface SentDeckIdea {
	ref: string;
	key: string;
	front: string;
	title?: string;
	lesson: string;
	lessonKey: string;
	courseKey: string;
	/** Solo si es de otro curso (la IA lo ve en su línea). */
	course?: string;
	noteId?: number;
}

/** Dónde se estudia la sesión: la lección, su curso y, en DataCamp, su programa. */
export interface DeckScope {
	course: string;
	lesson: string;
	/** Programa activo: su slug (kinema::programa) y los cursos que lo forman (kinemaSlug del título). */
	program?: { slug: string; courseKeys: string[] } | null;
}

export type DeckProximity = 'lesson' | 'course' | 'program' | 'other';

/** Qué tan cerca está una tarjeta del mazo de la sesión (decide qué reglas se aplican). */
export function proximityOf(entry: Pick<DeckConcept, 'courseKey' | 'lessonKey' | 'tracks'>, scope: DeckScope): DeckProximity {
	const courseKey = kinemaSlug(scope.course);
	if (entry.courseKey === courseKey) return entry.lessonKey === kinemaSlug(scope.lesson) ? 'lesson' : 'course';
	const program = scope.program;
	if (program?.slug && ((entry.tracks ?? []).includes(program.slug) || (entry.courseKey && program.courseKeys.includes(entry.courseKey)))) return 'program';
	return 'other';
}

/** Una idea de la sesión que ya estaba en el mazo (se guarda en studyContent.deckMatches). */
export interface DeckMatch {
	/** Índice en keyConcepts; -1 = una tarjeta sin idea con el mismo frente que una del mazo. */
	idea: number;
	/** Frente (texto) de la tarjeta que ya tienes. */
	front: string;
	/** Lección de esa tarjeta. */
	lesson: string;
	/** Su curso, solo si NO es el de la sesión (otro curso del programa u otro tuyo). */
	course?: string;
	/** Es de una sesión anterior de esta misma lección. */
	sameLesson?: boolean;
	via: DeckMatchVia;
	source: DeckSource;
	noteId?: number;
	/** frontKey de la tarjeta del mazo (= el de la tarjeta de la sesión si coincidió por frente). */
	key?: string;
	/** «Repasar hoy en Anki» la puso para hoy (solo al pulsarlo). */
	rescheduledAt?: number;
}

/** Tope de tarjetas del mazo en el prompt (≈ 40 líneas, ≈ 5 KB): el mismo que acepta el service worker. */
export const PROMPT_DECK_LIMIT = DECK_IDEAS_LIMIT;
export const PROMPT_DECK_CHARS = 5000;
/** Un título más corto que esto («Uso», «Tipos») no identifica una idea. */
const MIN_TITLE_KEY = 8;

const uniq = <T,>(items: T[]) => [...new Set(items)];
/** Nombre legible de un curso del que solo se sabe su etiqueta («intro-to-sql» → «Intro to sql»). */
const courseLabel = (e: { course: string; courseKey: string }) => e.course || (e.courseKey ? e.courseKey.charAt(0).toUpperCase() + e.courseKey.slice(1).replace(/-/g, ' ') : '');

const decode = (s: string) => s
	.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
	.replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&');

/** Texto plano de un frente (sin HTML, entidades resueltas, espacios colapsados). */
export function plainText(html: string): string {
	return decode(String(html || '')
		.replace(/<\/?(b|strong|em|i|u|code|span|mark|sub|sup|kbd)\b[^>]*>/gi, '')
		.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ').trim();
}

/** Lo que el frente marca como código en línea (nombres canónicos: `javac`, `new`…). */
export function codeTerms(html: string): string[] {
	const out: string[] = [];
	const withoutBlocks = String(html || '').replace(/<pre[\s\S]*?<\/pre>/gi, ' ');
	for (const m of withoutBlocks.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/gi)) {
		const term = plainText(m[1]);
		if (term && term.length <= 40) out.push(term);
	}
	return uniq(out);
}

/** Clave del título de una idea («Título — detalle»); vacía si es demasiado corto para identificarla. */
export function ideaTitleKey(idea: string): string {
	const key = frontKey(splitIdea(String(idea ?? '')).title);
	return key.length >= MIN_TITLE_KEY ? key : '';
}

/** Texto normalizado para buscar términos con límites de palabra (sin acentos, sin signos). */
function termText(value: string): string {
	return ` ${String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+#]+/g, ' ').trim()} `;
}

/** ¿Aparece el término, como palabra(s) completa(s), en el texto ya normalizado? */
function termIn(text: string, term: string): boolean {
	const t = termText(term).trim();
	return t.length >= 2 && text.includes(` ${t} `);
}

/**
 * GUID de una tarjeta de conceptos — el MISMO que pone la exportación
 * (StudyAgentTab.stableAnkiGuid delega aquí): curso|lección|[study:|duda:]frente.
 */
export function conceptCardGuid(course: string, lesson: string, card: { id?: string; front: string; doubt?: boolean }): string {
	const extra = isStudyCard(card.id);
	const source = `${sanitizeDeckSegment(course)}|${sanitizeDeckSegment(lesson)}|${card.doubt ? 'duda:' : extra ? 'study:' : ''}${card.front}`;
	let hash = 2166136261;
	for (let i = 0; i < source.length; i += 1) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return `usb${hash.toString(36)}`;
}

// ── El mazo, desde el historial o desde Anki ───────────────────────────────

/** Lo mínimo de un registro del historial. */
export interface DeckHistoryRecord {
	courseName: string;
	lectureName: string;
	exportedAt?: number;
	deletedAt?: number;
	exportedGuids?: string[];
	dcTrackSlug?: string;
	ankiCards?: { id?: string; front: string; conceptRefs?: number[]; excluded?: boolean; doubt?: boolean; tags?: string[] }[];
	studyContent?: unknown;
}

interface ContentLike { keyConcepts: string[]; conceptTerms: string[]; deckMatches: unknown }
function contentOf(raw: unknown): ContentLike {
	const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
	return { keyConcepts: strings(c.keyConcepts), conceptTerms: strings(c.conceptTerms), deckMatches: c.deckMatches };
}

function mergeEntries(entries: DeckConcept[]): DeckConcept[] {
	const out = new Map<string, DeckConcept>();
	for (const e of entries) {
		const id = `${e.courseKey}|${e.lessonKey}|${e.key}`;
		const prev = out.get(id);
		if (!prev) { out.set(id, e); continue; }
		out.set(id, {
			...prev,
			titles: uniq([...prev.titles, ...e.titles]), terms: uniq([...prev.terms, ...e.terms]), tracks: uniq([...prev.tracks, ...e.tracks]),
			course: prev.course || e.course, at: Math.max(prev.at, e.at), noteId: prev.noteId ?? e.noteId,
		});
	}
	return [...out.values()].sort((a, b) => b.at - a.at);
}

/**
 * Las tarjetas que el historial dice exportadas (sin Anki conectado), de
 * TODOS los cursos (el alcance lo decide proximityOf). Solo las aceptadas y,
 * si consta, solo las que llevó la última exportación (una tarjeta añadida
 * después no está en Anki). Las que una sesión anterior ya reconoció como «en
 * tu mazo» suman su título a la tarjeta original.
 */
export function conceptsFromHistory(records: DeckHistoryRecord[]): DeckConcept[] {
	const entries: DeckConcept[] = [];
	const chained: { key: string; lessonKey: string; title: string }[] = [];
	for (const rec of records) {
		if (!rec || rec.deletedAt || !rec.exportedAt || !rec.courseName) continue;
		const content = contentOf(rec.studyContent);
		const exported = Array.isArray(rec.exportedGuids) && rec.exportedGuids.length > 0 ? new Set(rec.exportedGuids) : null;
		const lessonKey = kinemaSlug(rec.lectureName);
		const courseKey = kinemaSlug(rec.courseName);
		for (const card of rec.ankiCards ?? []) {
			if (!card || typeof card.front !== 'string' || card.excluded) continue;
			if (exported && !exported.has(conceptCardGuid(rec.courseName, rec.lectureName, card))) continue;
			const key = frontKey(card.front);
			if (!key) continue;
			const titles = (card.conceptRefs ?? []).map((r) => content.keyConcepts[r]).filter(Boolean).map((idea) => splitIdea(idea).title);
			entries.push({
				front: plainText(card.front).slice(0, 200),
				key,
				titles: uniq(titles),
				// Sus etiquetas de la IA son las kinema::tema de Anki: los mismos nombres en las dos fuentes.
				terms: uniq([...content.conceptTerms, ...codeTerms(card.front), ...(Array.isArray(card.tags) ? card.tags.filter((t) => typeof t === 'string') : [])]),
				lesson: rec.lectureName,
				lessonKey,
				courseKey,
				course: rec.courseName,
				tracks: rec.dcTrackSlug ? [rec.dcTrackSlug] : [],
				at: rec.exportedAt,
			});
		}
		for (const m of sanitizeDeckMatches(content.deckMatches, content.keyConcepts.length)) {
			if (m.idea >= 0) chained.push({ key: m.key || frontKey(m.front), lessonKey: kinemaSlug(m.lesson), title: splitIdea(content.keyConcepts[m.idea]).title });
		}
	}
	const merged = mergeEntries(entries);
	for (const c of chained) {
		const target = merged.find((e) => e.key === c.key && e.lessonKey === c.lessonKey) ?? merged.find((e) => e.key === c.key);
		if (target && c.title && !target.titles.includes(c.title)) target.titles = [...target.titles, c.title];
	}
	return merged;
}

/** Una nota de conceptos leída de Anki (ankiConnectOps.conceptNotes). */
export interface AnkiConceptNoteLike {
	id: number;
	front: string;
	lesson: string;
	tags: string[];
}

/**
 * Las tarjetas que hay DE VERDAD en Anki. El historial (si lo hay) solo aporta
 * los títulos de idea y los conceptTerms de cada tarjeta: Anki manda sobre qué
 * existe (una borrada allí ya no cuenta; una de otro equipo, sí).
 * `options.course`: estas notas son de ese curso (la búsqueda del curso
 * incluye su mazo antiguo, sin etiquetas). `options.courseNames`: kinemaSlug
 * del curso → su nombre (historial y registro de mazos), para decir de qué
 * curso es una tarjeta de otro curso.
 */
export function conceptsFromAnki(
	notes: AnkiConceptNoteLike[],
	records: DeckHistoryRecord[] = [],
	options: { course?: string; courseNames?: Record<string, string> } = {},
): DeckConcept[] {
	const history = conceptsFromHistory(records);
	const byKey = new Map<string, DeckConcept[]>();
	for (const h of history) byKey.set(h.key, [...(byKey.get(h.key) ?? []), h]);
	const names = options.courseNames ?? {};
	const entries: DeckConcept[] = [];
	for (const note of notes) {
		if (!note || typeof note.id !== 'number' || typeof note.front !== 'string') continue;
		const key = frontKey(note.front);
		if (!key) continue;
		const tags = Array.isArray(note.tags) ? note.tags.map(String) : [];
		const tagValue = (prefix: string) => tags.find((t) => t.startsWith(prefix))?.slice(prefix.length) ?? '';
		const lesson = plainText(note.lesson || '');
		const lessonKey = tagValue('kinema::leccion::') || kinemaSlug(lesson);
		const courseKey = options.course ? kinemaSlug(options.course) : tagValue('kinema::curso::');
		const candidates = (byKey.get(key) ?? []).filter((h) => !courseKey || h.courseKey === courseKey);
		const hist = candidates.find((h) => h.lessonKey === lessonKey) ?? candidates[0];
		const topics = tags.filter((t) => t.startsWith('kinema::tema::')).map((t) => t.slice('kinema::tema::'.length).replace(/-/g, ' '));
		entries.push({
			front: plainText(note.front).slice(0, 200),
			key,
			titles: hist?.titles ?? [],
			terms: uniq([...codeTerms(note.front), ...topics, ...(hist?.terms ?? [])]),
			lesson: lesson || hist?.lesson || lessonKey,
			lessonKey,
			courseKey,
			course: options.course || names[courseKey] || hist?.course || '',
			tracks: uniq([...programsInTags(tags), ...(hist?.tracks ?? [])]),
			noteId: note.id,
			at: note.id,
		});
	}
	return mergeEntries(entries);
}

// ── Qué se le enseña a la IA ───────────────────────────────────────────────

const PROXIMITY_SCORE: Record<DeckProximity, number> = { lesson: 100, course: 40, program: 25, other: 0 };

/**
 * Las tarjetas del mazo que viajan al prompt. Todas las cercanas si caben; si
 * no, primero las de esta lección, luego las del curso y su programa, y las que
 * comparten nombres canónicos con la transcripción; al final, las recientes.
 * De otros cursos, solo las que comparten algún nombre canónico. No decide
 * nada: la identidad la juzga la IA y se valida aquí.
 */
export function selectForPrompt(
	entries: DeckConcept[],
	input: { scope: DeckScope; transcript: string; limit?: number; maxChars?: number },
): SentDeckIdea[] {
	const limit = input.limit ?? PROMPT_DECK_LIMIT;
	const maxChars = input.maxChars ?? PROMPT_DECK_CHARS;
	const text = termText(input.transcript);
	const ranked = entries
		.map((e, i) => {
			const proximity = proximityOf(e, input.scope);
			const hits = e.terms.filter((t) => termIn(text, t)).length;
			return { e, i, proximity, score: PROXIMITY_SCORE[proximity] + Math.min(hits, 3) * 10, hits };
		})
		.filter((x) => x.proximity !== 'other' || x.hits > 0)
		.sort((a, b) => b.score - a.score || a.i - b.i);
	const out: SentDeckIdea[] = [];
	const seen = new Set<string>();
	let chars = 0;
	for (const { e, proximity } of ranked) {
		if (out.length >= limit) break;
		if (seen.has(e.key)) continue;
		const item: SentDeckIdea = {
			ref: `m${out.length + 1}`, key: e.key, front: e.front, lesson: e.lesson, lessonKey: e.lessonKey, courseKey: e.courseKey,
			...(proximity === 'program' || proximity === 'other' ? { course: courseLabel(e) } : {}),
			...(e.titles[0] ? { title: e.titles[0] } : {}), ...(e.noteId ? { noteId: e.noteId } : {}),
		};
		const line = deckPromptLine(item);
		const size = line.text.length + line.lesson.length + (line.course?.length ?? 0) + 24;
		if (chars + size > maxChars) break;
		chars += size;
		seen.add(e.key);
		out.push(item);
	}
	return out;
}

/** La línea del prompt de una tarjeta del mazo: «Título» — frente (y su curso, si es otro). */
export function deckPromptLine(item: SentDeckIdea): { ref: string; text: string; lesson: string; course?: string } {
	const text = `${item.title ? `«${item.title}» — ` : ''}${item.front}`.slice(0, 220);
	return { ref: item.ref, text, lesson: item.lesson.slice(0, 120), ...(item.course ? { course: item.course.slice(0, 120) } : {}) };
}

/** Lo que llega del dock al service worker se sanea en shared/prompts (el SW lo importa sin Anki). */
export { sanitizeDeckIdeas } from '../../shared/prompts.ts';

// ── ¿Qué ideas de la sesión ya estaban? ────────────────────────────────────

/**
 * Decide qué ideas de la sesión ya están en el mazo. Primero lo determinista
 * (mismo frente; mismo título de idea) en la lección, el curso y su programa;
 * después la IA, solo con ids de la lista que se le envió (una idea por id),
 * en cualquier alcance.
 */
export function matchDeckIdeas(input: {
	keyConcepts: string[];
	cards: { front: string; conceptRefs?: number[]; doubt?: boolean }[];
	questions?: { q: string; conceptRefs?: number[] }[];
	claims?: unknown;
	index: DeckIndex;
	sent?: SentDeckIdea[];
	scope: DeckScope;
}): DeckMatch[] {
	const n = input.keyConcepts.length;
	const scope = input.scope;
	const source = input.index.source;
	const valid = (r: number) => Number.isInteger(r) && r >= 0 && r < n;
	// Solo lo cercano decide por frente o título (entre cursos sin relación, solo la IA).
	const near = input.index.entries.filter((e) => proximityOf(e, scope) !== 'other');
	const rank = (e: DeckConcept) => PROXIMITY_SCORE[proximityOf(e, scope)];
	const byKey = new Map<string, DeckConcept>();
	const byTitle = new Map<string, DeckConcept>();
	// La más cercana gana (otra lección del curso antes que su programa), y a igualdad la más reciente.
	for (const e of [...near].sort((a, b) => rank(b) - rank(a) || b.at - a.at)) {
		if (!byKey.has(e.key)) byKey.set(e.key, e);
		for (const t of e.titles) {
			const tk = ideaTitleKey(t);
			if (tk && !byTitle.has(tk)) byTitle.set(tk, e);
		}
	}
	const toMatch = (idea: number, e: { key: string; front: string; lesson: string; lessonKey: string; courseKey: string; course?: string; noteId?: number }, via: DeckMatchVia): DeckMatch => {
		const sameCourse = e.courseKey === kinemaSlug(scope.course);
		return {
			idea, front: e.front, lesson: e.lesson, via, source, key: e.key,
			...(!sameCourse ? { course: courseLabel({ course: e.course ?? '', courseKey: e.courseKey }) } : {}),
			...(sameCourse && e.lessonKey === kinemaSlug(scope.lesson) ? { sameLesson: true } : {}),
			...(e.noteId ? { noteId: e.noteId } : {}),
		};
	};
	const matches = new Map<number, DeckMatch>();
	const loose: DeckMatch[] = [];

	// 1. El mismo frente: es la misma tarjeta.
	for (const card of input.cards) {
		if (card.doubt) continue;
		const key = frontKey(card.front);
		const e = key ? byKey.get(key) : undefined;
		if (!e) continue;
		const refs = (card.conceptRefs ?? []).filter(valid);
		if (refs.length === 0) {
			if (!loose.some((m) => m.key === key)) loose.push(toMatch(-1, e, 'frente'));
			continue;
		}
		for (const r of refs) if (!matches.has(r)) matches.set(r, toMatch(r, e, 'frente'));
	}
	// La pregunta de UNA idea con el frente de una tarjeta del mazo (su tarjeta de cobertura sería esa).
	for (const q of input.questions ?? []) {
		const refs = (q.conceptRefs ?? []).filter(valid);
		if (refs.length !== 1 || matches.has(refs[0])) continue;
		const e = byKey.get(frontKey(q.q));
		if (e) matches.set(refs[0], toMatch(refs[0], e, 'frente'));
	}
	// 2. El mismo título de idea (la pista que la nombra).
	for (let i = 0; i < n; i += 1) {
		if (matches.has(i)) continue;
		const tk = ideaTitleKey(input.keyConcepts[i]);
		const e = tk ? byTitle.get(tk) : undefined;
		if (e) matches.set(i, toMatch(i, e, 'titulo'));
	}
	// 3. La IA: solo ids de la lista enviada, una idea por id.
	const sentByRef = new Map((input.sent ?? []).map((s) => [s.ref, s]));
	const usedRefs = new Set<string>();
	for (const claim of Array.isArray(input.claims) ? input.claims.slice(0, 12) : []) {
		const c = (claim && typeof claim === 'object' ? claim : {}) as Record<string, unknown>;
		const idea = Number(c.idea);
		const ref = String(c.ref ?? '').trim();
		const s = sentByRef.get(ref);
		if (!valid(idea) || matches.has(idea) || !s || usedRefs.has(ref)) continue;
		usedRefs.add(ref);
		matches.set(idea, toMatch(idea, s, 'ia'));
	}
	return [...[...matches.values()].sort((a, b) => a.idea - b.idea), ...loose];
}

const VIAS: DeckMatchVia[] = ['frente', 'titulo', 'ia'];

/** deckMatches guardados (al restaurar la sesión o leer el historial), validados. */
export function sanitizeDeckMatches(raw: unknown, ideas: number): DeckMatch[] {
	if (!Array.isArray(raw)) return [];
	const out: DeckMatch[] = [];
	for (const item of raw.slice(0, 16)) {
		const m = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
		const idea = Number(m.idea);
		const front = typeof m.front === 'string' ? m.front.trim().slice(0, 300) : '';
		const via = VIAS.includes(m.via as DeckMatchVia) ? (m.via as DeckMatchVia) : null;
		if (!Number.isInteger(idea) || idea < -1 || idea >= ideas || !front || !via) continue;
		if (idea >= 0 && out.some((o) => o.idea === idea)) continue;
		const key = typeof m.key === 'string' && /^[a-z0-9]{1,400}$/.test(m.key) ? m.key : '';
		if (idea === -1 && !key) continue;
		out.push({
			idea, front, via,
			lesson: typeof m.lesson === 'string' ? m.lesson.slice(0, 200) : '',
			source: m.source === 'anki' ? 'anki' : 'historial',
			...(typeof m.course === 'string' && m.course.trim() ? { course: m.course.trim().slice(0, 200) } : {}),
			...(m.sameLesson === true ? { sameLesson: true } : {}),
			...(Number.isSafeInteger(m.noteId) && Number(m.noteId) > 0 ? { noteId: Number(m.noteId) } : {}),
			...(key ? { key } : {}),
			...(typeof m.rescheduledAt === 'number' && m.rescheduledAt > 0 ? { rescheduledAt: m.rescheduledAt } : {}),
		});
	}
	return out;
}

/** Lo que cardCoverage necesita para no duplicar: ideas ya en el mazo y frentes repetidos. */
export function deckCoverage(matches: DeckMatch[]): { ideas: Set<number>; keys: Set<string> } {
	return {
		ideas: new Set(matches.filter((m) => m.idea >= 0).map((m) => m.idea)),
		keys: new Set(matches.filter((m) => m.idea === -1 || m.via === 'frente').map((m) => m.key || frontKey(m.front)).filter(Boolean)),
	};
}

/** Las ideas de una sesión guardada que ya estaban en el mazo (Biblioteca). */
export function deckIdeaMatches(studyContent: unknown): DeckMatch[] {
	const content = contentOf(studyContent);
	return sanitizeDeckMatches(content.deckMatches, content.keyConcepts.length).filter((m) => m.idea >= 0);
}

/**
 * Asigna ids de nota de Anki a matches que vinieron del historial: mismo frente
 * y, si se puede, misma lección y mismo curso.
 */
export function resolveNoteIds(matches: DeckMatch[], notes: AnkiConceptNoteLike[], sessionCourse = ''): Record<number, number> {
	const out: Record<number, number> = {};
	for (const m of matches) {
		if (m.idea < 0) continue;
		if (m.noteId) { out[m.idea] = m.noteId; continue; }
		const key = m.key || frontKey(m.front);
		const lessonTag = `kinema::leccion::${kinemaSlug(m.lesson)}`;
		const courseTag = `kinema::curso::${kinemaSlug(m.course || sessionCourse)}`;
		const same = notes.filter((note) => frontKey(note.front) === key);
		const pick = same.find((note) => (note.tags ?? []).includes(lessonTag) && (note.tags ?? []).includes(courseTag))
			?? same.find((note) => (note.tags ?? []).includes(lessonTag))
			?? same[0];
		if (pick) out[m.idea] = pick.id;
	}
	return out;
}
