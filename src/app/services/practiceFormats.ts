/**
 * Aplicar · prácticas estructuradas (flowVersion 3).
 *
 * La IA elige UN formato que ejercite lo que enseña la lección, en cualquier
 * curso (programación, idiomas, cocina, negocio…). Todos se corrigen al momento
 * contra una clave de respuestas: la IA no tiene que revisar nada.
 *
 *  · completar → huecos [[1]]…[[3]] dentro de un código o de un texto.
 *  · ordenar   → los pasos de un proceso (o las líneas de un algoritmo).
 *  · predecir  → «¿qué pasa si…?»: la salida de un código o el resultado de un caso.
 *  · error     → la línea (código) o el paso/afirmación (texto) que está mal.
 *  · decidir   → el mejor enfoque para un caso, entre 3 opciones.
 *
 * Si el bloque no cumple su forma (faltan huecos, índice fuera de rango…) se
 * devuelve null y Aplicar usa el ejercicio clásico (texto libre + revisión).
 * Así una sesión antigua o una respuesta incompleta del modelo nunca rompe.
 */

export type PracticeFormat = "completar" | "ordenar" | "predecir" | "error" | "decidir";

export const PRACTICE_FORMATS: readonly PracticeFormat[] = ["completar", "ordenar", "predecir", "error", "decidir"];

export interface PracticeBlank {
	/** Respuestas aceptadas (la primera es la canónica). */
	accept: string[];
	/** Pista corta para ese hueco (opcional). */
	hint?: string;
	/** 3 opciones para la pista: incluye la correcta (opcional). */
	options?: string[];
}

/** Campos que puede traer `application` además de setup/challenge/solution. */
export interface PracticeSpec {
	format?: unknown;
	language?: unknown;
	body?: unknown;
	blanks?: unknown;
	steps?: unknown;
	options?: unknown;
	answerIndex?: unknown;
	lines?: unknown;
	errorLine?: unknown;
	fixedLine?: unknown;
	explanation?: unknown;
}

interface PracticeBase {
	/** Lenguaje del código (language-xxx de Prism) si es de código. */
	language?: string;
	/** 1-3 líneas: por qué la respuesta correcta lo es. */
	explanation: string;
}

export type StructuredPractice =
	| (PracticeBase & { format: "completar"; body: string; blanks: PracticeBlank[] })
	| (PracticeBase & { format: "ordenar"; steps: string[] })
	| (PracticeBase & { format: "predecir" | "decidir"; body: string; options: string[]; answerIndex: number })
	| (PracticeBase & { format: "error"; lines: string[]; errorLine: number; fixedLine: string });

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const textList = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const intOf = (value: unknown): number | null => {
	const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
	return Number.isInteger(n) ? n : null;
};

/** Marcadores de hueco en el cuerpo: [[1]], [[2]]… (1-indexados, en orden). */
export const BLANK_MARKER = /\[\[(\d+)\]\]/g;

export function blankMarkers(body: string): number[] {
	return [...body.matchAll(BLANK_MARKER)].map((m) => Number(m[1]));
}

/**
 * Valida y normaliza la práctica estructurada de `application`. Devuelve null
 * si no hay formato o si su forma no es corregible sin la IA.
 */
export function parsePractice(app: PracticeSpec | null | undefined): StructuredPractice | null {
	if (!app || typeof app !== "object") return null;
	const format = text(app.format).toLowerCase() as PracticeFormat;
	if (!PRACTICE_FORMATS.includes(format)) return null;
	const language = text(app.language).replace(/^language-/, "") || undefined;
	const explanation = text(app.explanation);
	const base = { language, explanation };

	if (format === "completar") {
		const body = typeof app.body === "string" ? app.body.replace(/\s+$/, "") : "";
		const rawBlanks = Array.isArray(app.blanks) ? app.blanks : [];
		const blanks: PracticeBlank[] = rawBlanks.map((b) => {
			const item = (b && typeof b === "object" ? b : { accept: [b] }) as Record<string, unknown>;
			const accept = [...new Set(textList(item.accept ?? item.answer ?? item.answers))];
			const hint = text(item.hint) || undefined;
			const options = textList(item.options);
			const validOptions = options.length >= 2 && options.length <= 4 && options.some((o) => accept.some((a) => sameText(o, a, false)));
			return { accept, hint, ...(validOptions ? { options } : {}) };
		});
		const markers = blankMarkers(body);
		if (blanks.length < 1 || blanks.length > 3) return null;
		if (blanks.some((b) => b.accept.length === 0)) return null;
		// Cada hueco aparece UNA vez y en orden: [[1]] … [[n]].
		if (markers.length !== blanks.length || markers.some((m, i) => m !== i + 1)) return null;
		if (!body.replace(BLANK_MARKER, "").trim()) return null;
		return { ...base, format, body, blanks };
	}

	if (format === "ordenar") {
		const steps = textList(app.steps);
		if (steps.length < 3 || steps.length > 7) return null;
		if (new Set(steps.map((s) => normalizeAnswer(s, false))).size !== steps.length) return null;
		return { ...base, format, steps };
	}

	if (format === "predecir" || format === "decidir") {
		const body = typeof app.body === "string" ? app.body.replace(/\s+$/, "") : "";
		const options = textList(app.options);
		const answerIndex = intOf(app.answerIndex);
		if (options.length < 2 || options.length > 4) return null;
		if (new Set(options.map((o) => normalizeAnswer(o, false))).size !== options.length) return null;
		if (answerIndex === null || answerIndex < 0 || answerIndex >= options.length) return null;
		// «Predecir» necesita algo que predecir; «Decidir» puede apoyarse solo en el escenario.
		if (format === "predecir" && !body.trim()) return null;
		return { ...base, format, body, options, answerIndex };
	}

	// format === "error"
	const lines = Array.isArray(app.lines) ? app.lines.map((l) => (typeof l === "string" ? l.replace(/\s+$/, "") : text(l))) : [];
	const errorLine = intOf(app.errorLine);
	const fixedLine = typeof app.fixedLine === "string" ? app.fixedLine.replace(/\s+$/, "") : "";
	if (lines.length < 3 || lines.length > 12 || lines.some((l) => !l.trim())) return null;
	if (errorLine === null || errorLine < 0 || errorLine >= lines.length) return null;
	if (!fixedLine.trim() || sameText(fixedLine, lines[errorLine], true)) return null;
	return { ...base, format: "error", lines, errorLine, fixedLine };
}

/**
 * Normaliza una respuesta para compararla. En código se respeta mayúsculas
 * (String ≠ string) pero no los espacios ni el «;» final; en texto se ignoran
 * mayúsculas, acentos, espacios repetidos, comillas y la puntuación final.
 */
export function normalizeAnswer(value: string, isCode: boolean): string {
	const base = String(value ?? "").normalize("NFC").trim();
	if (isCode) return base.replace(/\s+/g, "").replace(/;+$/, "");
	return base
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/^["'«“‘`]+|["'»”’`]+$/g, "")
		.replace(/[.,;:!?¡¿]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function sameText(a: string, b: string, isCode: boolean): boolean {
	return normalizeAnswer(a, isCode) === normalizeAnswer(b, isCode);
}

export function checkBlank(value: string, blank: PracticeBlank, isCode: boolean): boolean {
	if (!String(value ?? "").trim()) return false;
	return blank.accept.some((a) => sameText(value, a, isCode));
}

/** `order[i]` = índice ORIGINAL del paso colocado en la posición i. */
export function checkOrder(order: number[], total: number): boolean[] {
	return Array.from({ length: total }, (_, i) => order[i] === i);
}

/**
 * Permutación estable (misma lección → mismo orden al volver) que nunca deja
 * los pasos ya ordenados. Semilla: el propio texto de los pasos.
 */
export function stableShuffle(items: string[]): number[] {
	const n = items.length;
	let seed = 0;
	for (const ch of items.join("|")) seed = (Math.imul(seed ^ ch.charCodeAt(0), 0x01000193) >>> 0);
	const rand = () => {
		seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
		return seed / 0x100000000;
	};
	const idx = Array.from({ length: n }, (_, i) => i);
	for (let i = n - 1; i > 0; i -= 1) {
		const j = Math.floor(rand() * (i + 1));
		[idx[i], idx[j]] = [idx[j], idx[i]];
	}
	if (idx.every((v, i) => v === i) && n > 1) idx.push(idx.shift() as number);
	return idx;
}

/**
 * Bonus de XP al acertar (además de practice_correct): igual para cualquier
 * curso. A la primera y sin pista se paga lo que antes solo pagaba el código.
 */
export function practiceBonus(attempts: number, hintsUsed: number): number {
	if (attempts <= 1 && hintsUsed === 0) return 20;
	if (attempts <= 1) return 10;
	return 0;
}

/** Rótulos y la instrucción de una línea de cada formato. */
export function practiceFormatMeta(format: PracticeFormat, isCode: boolean): { label: string; sub: string; instruction: string } {
	switch (format) {
		case "completar":
			return isCode
				? { label: "Completar", sub: "el código", instruction: "Escribe solo lo que falta en cada hueco." }
				: { label: "Completar", sub: "los huecos", instruction: "Completa cada hueco con la palabra o el dato que falta." };
		case "ordenar":
			return { label: "Ordenar", sub: isCode ? "las líneas" : "los pasos", instruction: isCode ? "Toca las líneas en el orden en que deben ir." : "Toca los pasos en el orden correcto." };
		case "predecir":
			return { label: "¿Qué pasa si…?", sub: isCode ? "predice la salida" : "predice el resultado", instruction: isCode ? "Elige lo que va a mostrar o hacer el código." : "Elige lo que va a pasar." };
		case "error":
			return isCode
				? { label: "Encuentra el error", sub: "una línea", instruction: "Toca la línea que tiene el error." }
				: { label: "Encuentra el error", sub: "un paso", instruction: "Toca el paso o la afirmación que está mal." };
		case "decidir":
		default:
			return { label: "Decidir", sub: "el mejor enfoque", instruction: "Elige la mejor opción para este caso." };
	}
}

/** El estado de la respuesta del estudiante, para resumirla y guardarla. */
export type PracticeAnswer =
	| { format: "completar"; values: string[] }
	| { format: "ordenar"; order: number[] }
	| { format: "predecir" | "decidir"; choice: number }
	| { format: "error"; line: number };

/** ¿Es correcta la respuesta? (y, en completar/ordenar, qué partes). */
export function gradePractice(practice: StructuredPractice, answer: PracticeAnswer, isCode: boolean): { correct: boolean; parts: boolean[] } {
	if (practice.format === "completar" && answer.format === "completar") {
		const parts = practice.blanks.map((b, i) => checkBlank(answer.values[i] ?? "", b, isCode));
		return { correct: parts.every(Boolean), parts };
	}
	if (practice.format === "ordenar" && answer.format === "ordenar") {
		const parts = checkOrder(answer.order, practice.steps.length);
		return { correct: answer.order.length === practice.steps.length && parts.every(Boolean), parts };
	}
	if ((practice.format === "predecir" || practice.format === "decidir") && (answer.format === "predecir" || answer.format === "decidir")) {
		const correct = answer.choice === practice.answerIndex;
		return { correct, parts: [correct] };
	}
	if (practice.format === "error" && answer.format === "error") {
		const correct = answer.line === practice.errorLine;
		return { correct, parts: [correct] };
	}
	return { correct: false, parts: [] };
}

const LETTERS = ["A", "B", "C", "D"];

/** Una línea legible de lo que respondió el estudiante (historial y Obsidian). */
export function summarizePracticeAnswer(practice: StructuredPractice, answer: PracticeAnswer): string {
	if (practice.format === "completar" && answer.format === "completar") {
		return practice.blanks.map((_, i) => `Hueco ${i + 1}: ${String(answer.values[i] ?? "").trim() || "—"}`).join(" · ");
	}
	if (practice.format === "ordenar" && answer.format === "ordenar") {
		return `Orden: ${answer.order.map((i) => practice.steps[i]).join(" → ")}`;
	}
	if ((practice.format === "predecir" || practice.format === "decidir") && (answer.format === "predecir" || answer.format === "decidir")) {
		const opt = practice.options[answer.choice];
		return opt ? `Elegiste ${LETTERS[answer.choice] ?? answer.choice + 1}: ${opt}` : "Sin elegir";
	}
	if (practice.format === "error" && answer.format === "error") {
		const line = practice.lines[answer.line];
		return line !== undefined ? `Señalaste la línea ${answer.line + 1}: ${line.trim()}` : "Sin señalar";
	}
	return "";
}

/** La solución en una línea (o bloque): para «Ver la solución», historial y Obsidian. */
export function practiceSolutionText(practice: StructuredPractice): string {
	switch (practice.format) {
		case "completar":
			return practice.blanks.map((b, i) => `Hueco ${i + 1}: ${b.accept[0]}`).join(" · ");
		case "ordenar":
			return practice.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
		case "predecir":
		case "decidir":
			return `${LETTERS[practice.answerIndex] ?? practice.answerIndex + 1}: ${practice.options[practice.answerIndex]}`;
		case "error":
			return `Línea ${practice.errorLine + 1}: ${practice.lines[practice.errorLine].trim()} → ${practice.fixedLine.trim()}`;
	}
}

/** El cuerpo con los huecos visibles como «____» (Obsidian y vista bloqueada). */
export function bodyWithGaps(body: string): string {
	return body.replace(BLANK_MARKER, "____");
}

/** El cuerpo de completar con las respuestas canónicas (para «Ver la solución»). */
export function bodyWithAnswers(practice: StructuredPractice): string {
	if (practice.format !== "completar") return "";
	return practice.body.replace(BLANK_MARKER, (_, n) => practice.blanks[Number(n) - 1]?.accept[0] ?? "____");
}

/**
 * Pista de un hueco: las opciones si las hay; si no, las primeras letras de la
 * respuesta canónica (nunca la respuesta entera).
 */
export function blankHint(blank: PracticeBlank): { options?: string[]; prefix?: string; text?: string } {
	if (blank.options && blank.options.length >= 2) return { options: blank.options, text: blank.hint };
	const canon = blank.accept[0] ?? "";
	const visible = canon.length <= 3 ? 1 : Math.min(3, Math.ceil(canon.length / 3));
	return { prefix: canon.slice(0, visible), text: blank.hint };
}

/** Pista de opciones: descarta UNA incorrecta (estable). */
export function optionToDiscard(practice: StructuredPractice): number | null {
	if (practice.format !== "predecir" && practice.format !== "decidir") return null;
	const wrong = practice.options.map((_, i) => i).filter((i) => i !== practice.answerIndex);
	return wrong.length > 1 ? wrong[wrong.length - 1] : null;
}

/** Pista de «error»: una ventana de 3 líneas que contiene la mala. */
export function errorWindow(practice: StructuredPractice): [number, number] | null {
	if (practice.format !== "error") return null;
	const start = Math.max(0, Math.min(practice.errorLine - 1, practice.lines.length - 3));
	return [start, Math.min(practice.lines.length - 1, start + 2)];
}

/**
 * Markdown de la práctica para la nota de Obsidian: el ejercicio tal cual se
 * vio y la solución plegada (callout). Sirve para cualquier curso.
 */
export function practiceMarkdown(practice: StructuredPractice, isCode: boolean): string[] {
	const fence = (code: string) => ["```" + (practice.language || ""), code, "```"];
	const lines: string[] = [];
	const meta = practiceFormatMeta(practice.format, isCode);
	lines.push(`**Formato:** ${meta.label} · ${meta.sub}`, "");
	if (practice.format === "completar") {
		lines.push(...(isCode ? fence(bodyWithGaps(practice.body)) : [bodyWithGaps(practice.body)]), "");
	} else if (practice.format === "ordenar") {
		const shuffled = stableShuffle(practice.steps);
		shuffled.forEach((i) => lines.push(`- ${practice.steps[i]}`));
		lines.push("");
	} else if (practice.format === "predecir" || practice.format === "decidir") {
		if (practice.body.trim()) lines.push(...(isCode ? fence(practice.body) : [practice.body]), "");
		practice.options.forEach((o, i) => lines.push(`${LETTERS[i] ?? i + 1}. ${o}`));
		lines.push("");
	} else if (practice.format === "error") {
		lines.push(...(isCode ? fence(practice.lines.join("\n")) : practice.lines.map((l, i) => `${i + 1}. ${l}`)), "");
	}
	lines.push("> [!example]- Ver solución");
	practiceSolutionText(practice).split("\n").forEach((l) => lines.push(`> ${l}`));
	if (practice.explanation) lines.push(">", `> ${practice.explanation}`);
	lines.push("");
	return lines;
}
