/**
 * Recordar (flowVersion 3): cada idea clave llega como «Título — detalle».
 * El título es la PISTA (se lee antes de decidir «Lo sabía» / «No del todo»);
 * el detalle es la respuesta, que se muestra al decidir: así responder ya es
 * práctica de recuerdo con corrección inmediata, no una casilla de relleno.
 *
 * Las sesiones antiguas traen la idea como una frase sin título: se muestra
 * entera como pista y no hay detalle que desvelar.
 */

export interface IdeaCue {
	title: string;
	detail: string;
}

/** Separadores aceptados entre título y detalle (el prompt pide « — »). */
const SEPARATOR = /\s+[—–]\s+|\s+-\s+|:\s+/;

export function splitIdea(idea: string): IdeaCue {
	const raw = String(idea ?? "").trim();
	const match = raw.match(SEPARATOR);
	if (!match || match.index === undefined) return { title: raw, detail: "" };
	const title = raw.slice(0, match.index).trim();
	const detail = raw.slice(match.index + match[0].length).trim();
	// Una pregunta directa larga sigue siendo una pista; la prosa larga no.
	const isQuestion = title.startsWith("¿") || title.endsWith("?") || QUESTION_START_RE.test(title);
	const maxWords = isQuestion ? 16 : 9;
	if (!title || !detail || title.split(/\s+/).length > maxWords) return { title: raw, detail: "" };
	return { title: title.replace(/[.;:]+$/, ""), detail };
}

const QUESTION_START_RE = /^(qu[eé]|qui[eé]n(?:es)?|c[oó]mo|cu[aá]ndo|d[oó]nde|cu[aá]l(?:es)?|cu[aá]nto(?:s|as)?|por\s+qu[eé]|para\s+qu[eé]|en\s+qu[eé]|de\s+d[oó]nde|a\s+qu[eé])(?=\s|$)/i;

/**
 * Presenta la pista de Recordar como una pregunta clara si empieza por un
 * interrogativo sin signos («Qué produce javac» → «¿Qué produce javac?»),
 * manteniendo intacto el texto original para el historial y las notas.
 */
export function formatRecallPrompt(title: string): string {
	const clean = String(title ?? "").trim().replace(/[.;:]+$/, "");
	if (!clean) return "";
	if (clean.startsWith("¿") || clean.endsWith("?")) return clean.startsWith("¿") ? clean : `¿${clean}`;
	if (QUESTION_START_RE.test(clean)) return `¿${clean}?`;
	return clean;
}

/** Resultado de la confirmación de una sesión: ok / fail, o skip si no se pidió. */
export type SpotCheckResult = "ok" | "fail" | "skip";

/**
 * Confianza en tu autoevaluación: si tus 3 últimas confirmaciones salieron
 * bien, Comprobar se salta la confirmación ESTA vez (ser sincero ahorra
 * preguntas). Nunca dos veces seguidas: tras un «skip» se vuelve a confirmar,
 * así la confianza siempre se apoya en evidencia reciente. Un fallo la anula.
 * `recent` va de la sesión más reciente a la más antigua.
 */
export function trustsSelfReport(recent: (SpotCheckResult | undefined | null)[], needed = 3): boolean {
	const known = recent.filter((r): r is SpotCheckResult => r === "ok" || r === "fail" || r === "skip");
	if (known[0] === "skip") return false;
	const verified = known.filter((r) => r !== "skip");
	if (verified.length < needed) return false;
	return verified.slice(0, needed).every((r) => r === "ok");
}

/** Cuántas confirmaciones admite el plan: 0-1 de base y +1 si la primera falló. */
export function spotBudgetFor(base: number, spotFailed: boolean): number {
	return Math.max(0, base) + (spotFailed ? 1 : 0);
}
