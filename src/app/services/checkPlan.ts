// §1.2 · Plan de Comprobar: proporcional a la lección y a lo que NO recordaste.
//
// El tamaño NO es un número fijo. Sale de dos datos:
//  · la lección: la IA elige cuántas ideas clave tiene según su densidad
//    (keyConceptRange en shared/prompts.ts: 2–3 en una corta, hasta 7 en una
//    larga) y escribe UNA pregunta por idea + una de síntesis;
//  · el estudiante: lo que marcó en Recordar.
// Comprobar pregunta:
//  1. una en el nivel que eligió (prefiere una idea que no marcó);
//  2. una por cada idea que no marcó y que aún no salió;
//  3. si marcó alguna y ninguna pregunta la tocó, UNA sobre una idea marcada:
//     confirma que el autoinforme es fiable (sobreconfianza, R5).
// Tope de fatiga: MAX_CHECK_QUESTIONS (≈10 min de respuestas abiertas). Solo
// actúa en lecciones con 6–7 ideas y nada marcado; las ideas que quedan fuera
// se dicen en pantalla y van a Anki como refuerzo (no se pierden).
// Orden: cada siguiente cubre más ideas pendientes; a igualdad, la de
// dificultad más cercana a la meta (baja tras fallar, sube tras acertar, R7).

export const MAX_CHECK_QUESTIONS = 5;
const DIFF = ["confused", "partial", "clear", "mastered"];

export type PlanContent = {
	keyConcepts: unknown[];
	questions: { difficulty: string; conceptRefs?: number[] }[];
};

/** Por qué se hace cada pregunta del plan (se muestra al estudiante). */
export type PlanStep = "start" | "gap" | "spot";

export type CheckPlan = {
	/** Preguntas de la cola que pertenecen al plan (lo que sigue fue el reto opcional). */
	planned: number;
	/** Tamaño total del plan: «Pregunta N de total». */
	total: number;
	/** Motivo de cada pregunta planificada, en orden. */
	kinds: PlanStep[];
	/** Ideas no marcadas que el plan no llega a preguntar (tope o sin pregunta): van a Anki. */
	uncovered: number[];
};

const refsOf = (cnt: PlanContent, qi: number) => cnt.questions[qi]?.conceptRefs ?? [];

/** Tope del plan: nunca más preguntas que ideas, ni más que el tope de fatiga. */
export function checkCap(cnt: PlanContent): number {
	return Math.max(1, Math.min(MAX_CHECK_QUESTIONS, cnt.keyConcepts.length, cnt.questions.length));
}

function pendingGaps(cnt: PlanContent, asked: number[], checked: Set<number>): Set<number> {
	const gaps = new Set(cnt.keyConcepts.map((_, i) => i).filter((i) => !checked.has(i)));
	asked.forEach((qi) => refsOf(cnt, qi).forEach((r) => gaps.delete(r)));
	return gaps;
}

/** La siguiente pregunta del plan, o undefined si el plan ya está cubierto. */
export function pickNextCheckQuestion(
	cnt: PlanContent,
	asked: number[],
	checked: Set<number>,
	targetDifficulty?: number,
): { i: number; kind: "gap" | "spot" } | undefined {
	if (asked.length === 0 || asked.length >= checkCap(cnt)) return undefined;
	const used = new Set(asked);
	const dist = (d: number) => (targetDifficulty === undefined ? 0 : Math.abs(d - targetDifficulty));
	const pool = cnt.questions
		.map((q, i) => ({ i, d: DIFF.indexOf(q.difficulty), refs: q.conceptRefs ?? [] }))
		.filter((x) => !used.has(x.i));

	const gaps = pendingGaps(cnt, asked, checked);
	if (gaps.size > 0) {
		const gap = pool
			.map((x) => ({ ...x, hits: x.refs.filter((r) => gaps.has(r)).length }))
			.filter((x) => x.hits > 0)
			.sort((a, b) => (b.hits - a.hits) || (dist(a.d) - dist(b.d)) || (a.d - b.d))[0];
		if (gap) return { i: gap.i, kind: "gap" };
	}

	// Verificación de una idea marcada (una sola vez y solo si ninguna pregunta la tocó).
	const spotDone = asked.some((qi) => refsOf(cnt, qi).some((r) => checked.has(r)));
	if (checked.size === 0 || spotDone) return undefined;
	const pure = (refs: number[]) => (refs.every((r) => checked.has(r)) ? 1 : 0);
	const spot = pool
		.filter((x) => x.refs.some((r) => checked.has(r)))
		.sort((a, b) => (pure(b.refs) - pure(a.refs)) || (a.refs.length - b.refs.length) || (dist(a.d) - dist(b.d)) || (a.d - b.d))[0];
	return spot ? { i: spot.i, kind: "spot" } : undefined;
}

/** ¿`qi` habría sido un paso válido del plan tras `asked`? (para releer una cola guardada). */
function stepKind(cnt: PlanContent, asked: number[], checked: Set<number>, qi: number): PlanStep | undefined {
	const next = pickNextCheckQuestion(cnt, asked, checked);
	if (!next) return undefined;
	if (next.kind === "gap") {
		const gaps = pendingGaps(cnt, asked, checked);
		return refsOf(cnt, qi).some((r) => gaps.has(r)) ? "gap" : undefined;
	}
	return refsOf(cnt, qi).some((r) => checked.has(r)) ? "spot" : undefined;
}

/** Estado del plan para una cola presentada: cuántas son del plan, el total y por qué. */
export function checkPlanState(cnt: PlanContent, queue: number[], checked: Set<number>): CheckPlan {
	if (queue.length === 0) return { planned: 0, total: 0, kinds: [], uncovered: [] };
	const kinds: PlanStep[] = ["start"];
	for (let k = 1; k < queue.length; k += 1) {
		const kind = stepKind(cnt, queue.slice(0, k), checked, queue[k]);
		if (!kind) break;
		kinds.push(kind);
	}
	const planned = kinds.length;
	const sim = queue.slice(0, planned);
	for (let next = pickNextCheckQuestion(cnt, sim, checked); next; next = pickNextCheckQuestion(cnt, sim, checked)) {
		sim.push(next.i);
	}
	return { planned, total: sim.length, kinds, uncovered: [...pendingGaps(cnt, sim, checked)] };
}

/** Reordena lo respondido (guardado en orden canónico) como se presentó: arranque, plan, reto. */
export function orderPresented(cnt: PlanContent, startIdx: number, answered: number[], checked: Set<number>): number[] {
	const queue = [startIdx];
	const rest = answered.filter((i) => i !== startIdx);
	while (rest.length > 0) {
		const k = rest.findIndex((i) => stepKind(cnt, queue, checked, i) !== undefined);
		queue.push(...rest.splice(k >= 0 ? k : 0, 1));
	}
	return queue;
}

/**
 * Cobertura conceptual del contenido generado: ideas sin pregunta, ideas sin
 * tarjeta y referencias fuera de rango. Lo usa el QA y el aviso de Fijar.
 */
export function conceptCoverage(cnt: PlanContent & { ankiCards?: { conceptRefs?: number[]; excluded?: boolean }[] }) {
	const n = cnt.keyConcepts.length;
	const inRange = (r: number) => Number.isInteger(r) && r >= 0 && r < n;
	const qRefs = cnt.questions.flatMap((q) => q.conceptRefs ?? []);
	const cRefs = (cnt.ankiCards ?? []).filter((c) => !c.excluded).flatMap((c) => c.conceptRefs ?? []);
	const ideas = cnt.keyConcepts.map((_, i) => i);
	return {
		ideasWithoutQuestion: ideas.filter((i) => !qRefs.includes(i)),
		ideasWithoutCard: ideas.filter((i) => !cRefs.includes(i)),
		invalidRefs: [...qRefs, ...cRefs].filter((r) => !inRange(r)).length,
	};
}
