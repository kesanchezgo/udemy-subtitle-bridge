/**
 * La nota de una lección rehecha desde el HISTORIAL (fase 3), para «Guardar en
 * Obsidian» desde la Biblioteca: lecciones que terminaste sin Obsidian, o cuya
 * nota ya no está en el vault.
 *
 * Mismas secciones y mismas reglas que la nota de Fijar, con lo que el
 * historial guarda: contenido, lo que sabías en Recordar, tus respuestas de
 * Comprobar (y si salieron a la primera), la práctica, las dudas y las tarjetas
 * aceptadas. Lo que el historial no guarda no se inventa: la calibración
 * (su mensaje es de la sesión) y la hora de cada idea si la lección no la tenía.
 */
import { prettifySlug } from './library.ts';
import { summarizePracticeAnswer, type PracticeAnswer, type PracticeFormat } from './practiceFormats.ts';
import type { ObsidianSessionData, StudyResultSummary } from './obsidianExport.ts';
import type { LectureHistoryRecord } from './historyService.ts';

const GOOD = new Set(['correct', 'excellent']);
const WEAK = new Set(['partial', 'wrong']);

/** «Lo sabía» por idea: recallMarks (flujo 3) o, en sesiones antiguas, las ideas marcadas. */
export function knownIdeaIndexes(rec: Pick<LectureHistoryRecord, 'recallMarks' | 'checkedConceptIndexes'>, total: number): Set<number> {
	if (Array.isArray(rec.recallMarks) && rec.recallMarks.length > 0) {
		return new Set(rec.recallMarks.map((m, i) => (m === 'knew' ? i : -1)).filter((i) => i >= 0 && i < total));
	}
	return new Set((rec.checkedConceptIndexes ?? []).filter((i) => i >= 0 && i < total));
}

/** El mismo cierre que Study (§1.4), con los datos del historial. */
export function resultFromRecord(rec: LectureHistoryRecord, options: { includeCards?: boolean } = {}): StudyResultSummary {
	const content = rec.studyContent;
	const total = content?.keyConcepts.length ?? 0;
	const answered = (rec.questions ?? []).filter((q) => q.rating);
	const firstTry = answered.filter((q) => q.firstTryCorrect).length;
	const improved = answered.filter((q) => GOOD.has(String(q.rating)) && !q.firstTryCorrect).length;
	const practice: StudyResultSummary['practice'] = rec.practiceStatus === 'correct' ? 'correct' : rec.practiceStatus === 'done' ? 'done' : 'later';
	const pending = Boolean(rec.questionsSkipped) || practice === 'later';
	const title = pending ? 'Lección con pasos pendientes'
		: answered.length > 0 && firstTry === answered.length && practice === 'correct' ? 'Lección dominada'
			: 'Lección completada';
	const accepted = (rec.ankiCards ?? []).filter((c) => !c.excluded);
	const doubt = accepted.filter((c) => c.doubt).length;
	const reinforce = accepted.filter((c) => c.reinforce && !c.doubt).length;
	return {
		title,
		remembered: { count: knownIdeaIndexes(rec, total).size, total },
		check: { firstTry, improved, ...(answered.length > 0 ? { total: answered.length } : {}), skipped: Boolean(rec.questionsSkipped) },
		practice,
		cards: {
			total: accepted.length,
			reinforce,
			destination: rec.exportedAt ? 'anki' : options.includeCards ? 'obsidian' : 'none',
			doubt: doubt || undefined,
		},
	};
}

/**
 * Los datos de la nota de una lección del historial; null si no guardó su
 * contenido (lecciones muy antiguas: sin contenido no hay nota honesta).
 */
export function sessionDataFromRecord(
	rec: LectureHistoryRecord,
	options: { programTitles?: Record<string, string>; includeCards?: boolean } = {},
): ObsidianSessionData | null {
	const content = rec.studyContent;
	if (!content || !Array.isArray(content.keyConcepts) || content.keyConcepts.length === 0) return null;
	const known = knownIdeaIndexes(rec, content.keyConcepts.length);
	// Las respuestas se guardan en el orden canónico de las preguntas (persistQuestionsInCanonicalOrder).
	const weakPoints = (rec.questions ?? [])
		.map((attempt, i) => ({ attempt, question: content.questions.find((q) => q.q === attempt.prompt) ?? content.questions[i] }))
		.filter(({ attempt, question }) => question && WEAK.has(String(attempt.rating)))
		.map(({ question }) => ({ q: question!.q, answer: question!.answer }));
	const unrecalledIdeas = content.keyConcepts.filter((_, i) => !known.has(i));
	const doubts = (rec.doubts ?? []).flatMap((thread) => thread.turns.map((turn) => ({ q: turn.q, answer: turn.answer, quotes: turn.quotes ?? [], outside: Boolean(turn.outside) })));
	const challenge = rec.codeChallenge;
	const practice = content.application?.practice;
	const practiceResult = challenge?.format && (challenge.attempts ?? 0) > 0 ? {
		format: challenge.format as PracticeFormat,
		correct: GOOD.has(String(challenge.rating)),
		attempts: challenge.attempts ?? 1,
		hintsUsed: challenge.hintsUsed ?? 0,
		solutionSeen: Boolean(challenge.solutionSeen),
		answer: practice && challenge.structuredAnswer ? summarizePracticeAnswer(practice, challenge.structuredAnswer as PracticeAnswer) : challenge.answer ?? '',
	} : undefined;
	const accepted = (rec.ankiCards ?? []).filter((c) => !c.excluded);
	const programSlug = rec.dcTrackSlug;
	return {
		courseName: rec.courseName,
		lessonName: rec.lectureName,
		objective: rec.objective || undefined,
		sourceUrl: rec.lessonUrl || undefined,
		platform: rec.platform || (programSlug ? 'datacamp' : undefined),
		program: programSlug ? { slug: programSlug, title: options.programTitles?.[programSlug] || prettifySlug(programSlug) } : undefined,
		programs: programSlug ? [programSlug] : undefined,
		ankiDeck: rec.ankiDeck || undefined,
		recallNotes: rec.recallNotes?.trim() || undefined,
		weakPoints: weakPoints.length > 0 ? weakPoints : undefined,
		unrecalledIdeas: unrecalledIdeas.length > 0 ? unrecalledIdeas : undefined,
		// Igual que Study (practiceWeak): hecha sin acierto, o vista la solución.
		practiceToRedo: (rec.practiceStatus !== 'correct' && (rec.practiceStatus === 'done' || Boolean(challenge?.solutionSeen))) || undefined,
		spotCheck: rec.spotCheck,
		practiceResult,
		doubts: doubts.length > 0 ? doubts : undefined,
		result: resultFromRecord(rec, { includeCards: options.includeCards }),
		content: {
			...(content as unknown as ObsidianSessionData['content']),
			ankiCards: accepted.map((c) => ({ front: c.front, back: c.back, type: c.type })),
		},
	};
}
