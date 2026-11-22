/**
 * Cobertura de Fijar: CADA idea clave tiene al menos una tarjeta real.
 *
 * Antes el refuerzo creaba como mucho 2 tarjetas extra para ideas débiles sin
 * tarjeta: en una lección de 30 min con 6-7 ideas, alguna quedaba fuera aunque
 * la pantalla dijera «va a Anki». Ahora la cobertura se garantiza al normalizar
 * la sesión (generación y restauración) y el refuerzo solo MARCA y PRIORIZA
 * tarjetas que ya existen.
 *
 * Orden de preferencia para una idea sin tarjeta:
 *  1. La pregunta de Comprobar que la evalúa (frente = pregunta, dorso = su
 *     respuesta modelo). Mismo origen que las antiguas «study-refuerzo-q*»: el
 *     GUID es el mismo, así que una sesión antigua no se duplica en Anki.
 *  2. Si ninguna pregunta la toca y la idea trae «Título — detalle»: el título
 *     como pregunta, el detalle como respuesta.
 *  3. Si no hay nada fiable (idea antigua sin pregunta): no se inventa;
 *     conceptCoverage la sigue reportando como «sin tarjeta».
 */
import { splitIdea } from "./recallCue.ts";

export interface CoverageCard {
	id: string;
	type: string;
	front: string;
	back: string;
	tags: string[];
	conceptRefs?: number[];
	isHtml?: boolean;
	reinforce?: boolean;
	excluded?: boolean;
	doubt?: boolean;
	/** Fase 4: es de una idea que ya está en el mazo (por defecto no se exporta). */
	inDeck?: boolean;
}

/** Fase 4: ideas que ya están en el mazo y frentes (frontKey) que ya tiene. */
export interface DeckCoverageInput {
	ideas: Iterable<number>;
	keys?: Iterable<string>;
}

export interface CoverageQuestion {
	q: string;
	answer: string;
	conceptRefs?: number[];
}

/** Prefijos de tarjetas creadas por Kinema (no por la IA). Comparten GUID «study:». */
export const COVERAGE_PREFIX = "study-cobertura-";
export const REINFORCE_PREFIX = "study-refuerzo-";

export function isStudyCard(id: string | undefined): boolean {
	const v = String(id ?? "");
	return v.startsWith(COVERAGE_PREFIX) || v.startsWith(REINFORCE_PREFIX);
}

const escapeHtml = (s: string) => s
	.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Clave de frente: sin HTML, sin acentos, solo letras y números. */
export function frontKey(front: string): string {
	return String(front || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "");
}

/**
 * Dos tarjetas con el mismo frente son la misma nota en Anki: se queda la
 * primera y hereda los conceptRefs (y la marca de refuerzo) de las demás.
 */
export function mergeDuplicateCards<C extends CoverageCard>(cards: C[]): C[] {
	const out: C[] = [];
	const byKey = new Map<string, number>();
	for (const card of cards) {
		const key = frontKey(card.front);
		const at = key ? byKey.get(key) : undefined;
		if (at === undefined) {
			if (key) byKey.set(key, out.length);
			out.push(card);
			continue;
		}
		const kept = out[at];
		const refs = [...new Set([...(kept.conceptRefs ?? []), ...(card.conceptRefs ?? [])])].sort((a, b) => a - b);
		out[at] = {
			...kept,
			conceptRefs: refs,
			...(kept.reinforce || card.reinforce ? { reinforce: true } : {}),
		};
	}
	return out;
}

/** El dorso de una tarjeta creada desde una pregunta (el de las antiguas de refuerzo). */
export function questionCardBack(answer: string): string {
	return `<p><b>${escapeHtml(answer)}</b></p>`;
}

/**
 * Añade (al final) una tarjeta por cada idea que no tenga ninguna. Determinista:
 * misma sesión → mismas tarjetas e IDs, también al restaurar.
 */
export function ensureConceptCards<C extends CoverageCard>(
	keyConcepts: string[],
	questions: CoverageQuestion[],
	cards: C[],
	make: (card: CoverageCard) => C,
	deck?: DeckCoverageInput,
): C[] {
	const n = keyConcepts.length;
	if (n === 0) return cards;
	const covered = addCoverageCards(keyConcepts, questions, cards, make);
	return deck ? markDeckDuplicates(covered, deck) : covered;
}

/**
 * Fase 4: la tarjeta es un duplicado de lo que ya está en el mazo si tiene su
 * mismo frente o si TODAS sus ideas ya estaban (con al menos una). Queda fuera
 * del paquete por defecto; al restaurar se vuelve a marcar igual (determinista).
 */
export function isDeckDuplicate(card: { front: string; conceptRefs?: number[]; doubt?: boolean }, deck: { ideas: Set<number>; keys: Set<string> }): boolean {
	if (card.doubt) return false;
	if (deck.keys.has(frontKey(card.front))) return true;
	const refs = card.conceptRefs ?? [];
	return refs.length > 0 && refs.every((r) => deck.ideas.has(r));
}

function markDeckDuplicates<C extends CoverageCard>(cards: C[], input: DeckCoverageInput): C[] {
	const deck = { ideas: new Set(input.ideas), keys: new Set(input.keys ?? []) };
	if (deck.ideas.size === 0 && deck.keys.size === 0) return cards;
	return cards.map((c) => (isDeckDuplicate(c, deck) ? { ...c, inDeck: true, excluded: true } : c));
}

function addCoverageCards<C extends CoverageCard>(
	keyConcepts: string[],
	questions: CoverageQuestion[],
	cards: C[],
	make: (card: CoverageCard) => C,
): C[] {
	const n = keyConcepts.length;
	const valid = (r: number) => Number.isInteger(r) && r >= 0 && r < n;
	const covered = new Set(cards.filter((c) => !c.doubt).flatMap((c) => (c.conceptRefs ?? []).filter(valid)));
	const fronts = new Set(cards.map((c) => frontKey(c.front)));
	const ids = new Set(cards.map((c) => c.id));
	const added: C[] = [];

	for (let idea = 0; idea < n; idea += 1) {
		if (covered.has(idea)) continue;
		// 1. La pregunta que evalúa SOLO esta idea antes que la de síntesis.
		const candidates = questions
			.map((q, qi) => ({ q, qi, refs: (q.conceptRefs ?? []).filter(valid) }))
			.filter((x) => x.refs.includes(idea) && x.q.q.trim() && x.q.answer.trim())
			.sort((a, b) => a.refs.length - b.refs.length || a.qi - b.qi);
		let card: CoverageCard | null = null;
		for (const { q, qi, refs } of candidates) {
			const id = `${COVERAGE_PREFIX}q${qi}`;
			if (ids.has(id) || ids.has(`${REINFORCE_PREFIX}q${qi}`) || fronts.has(frontKey(q.q))) continue;
			card = { id, type: "concepto", front: q.q, back: questionCardBack(q.answer), tags: [], conceptRefs: refs, isHtml: true };
			break;
		}
		// 2. Sin pregunta: la propia idea si trae pista y detalle.
		if (!card) {
			const cue = splitIdea(keyConcepts[idea]);
			const front = `¿Qué hay que saber de «${cue.title}»?`;
			const id = `${COVERAGE_PREFIX}i${idea}`;
			if (cue.detail && !ids.has(id) && !fronts.has(frontKey(front))) {
				card = { id, type: "concepto", front, back: `<p>${escapeHtml(cue.detail)}</p>`, tags: [], conceptRefs: [idea], isHtml: true };
			}
		}
		if (!card) continue;
		const made = make(card);
		added.push(made);
		ids.add(made.id);
		fronts.add(frontKey(made.front));
		(made.conceptRefs ?? []).forEach((r) => covered.add(r));
	}
	return added.length ? [...cards, ...added] : cards;
}

/**
 * Ideas sin ninguna tarjeta incluida en el mazo (las excluidas a mano no
 * cuentan). Fase 4: las que ya estaban en el mazo (`inDeck`) cuentan como cubiertas.
 */
export function ideasWithoutCard(keyConcepts: unknown[], cards: { conceptRefs?: number[]; excluded?: boolean }[], inDeck?: Iterable<number>): number[] {
	const refs = new Set([...cards.filter((c) => !c.excluded).flatMap((c) => c.conceptRefs ?? []), ...(inDeck ?? [])]);
	return keyConcepts.map((_, i) => i).filter((i) => !refs.has(i));
}
