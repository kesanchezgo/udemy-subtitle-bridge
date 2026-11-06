/**
 * ¿Aparece esta palabra de vocabulario en el texto? Una sola regla para todo:
 * el filtro de candidatas (que la palabra esté de verdad en la lección), el
 * chip del video y la vista previa del panel.
 *
 * La IA da el LEMA («leak», «figure out») y los subtítulos traen formas
 * flexionadas («leaks», «figured it out»): con una comparación exacta se
 * perdían palabras reales de la lección. Se aceptan las flexiones regulares
 * del inglés (-s, -es, -ed, -ing, -er, y → ies, consonante doble) y hasta
 * dos palabras entre las partes de un phrasal verb. Nunca una subcadena:
 * «machine» no coincide con «machinery» ni con «submachine».
 * Las irregulares («run» → «ran») las cubre `form`: la forma exacta que la
 * IA vio en la transcripción.
 *
 * Puro y sin dependencias: lo usan la UI, el content script y los QA.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tokenPattern(token: string): string {
	const t = token.toLowerCase();
	// Cortas o con guion/apóstrofo («up», «object-oriented»): tal cual.
	if (t.length < 3 || /[^\p{L}]/u.test(t)) return escape(t);
	const alts = [`${escape(t)}(?:s|es|ed|ing|er|ers)?`];
	if (t.endsWith("e")) alts.push(`${escape(t.slice(0, -1))}(?:ing|ed|er|ers|es)`);
	if (/[^aeiou]y$/.test(t)) alts.push(`${escape(t.slice(0, -1))}(?:ies|ied|ier|iers)`);
	if (/[^aeiou][aeiou][bdgklmnprt]$/.test(t)) alts.push(`${escape(t)}${escape(t.slice(-1))}(?:ed|ing|er|ers)`);
	return `(?:${alts.join("|")})`;
}

function matchesLemma(word: string, text: string): boolean {
	const tokens = word.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0 || !text) return false;
	const body = tokens.map(tokenPattern).join("(?:\\s+[\\p{L}'’-]+){0,2}?\\s+");
	return new RegExp(`(^|[^\\p{L}\\p{N}])${body}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function vocabularyMatches(word: string, text: string, form?: string): boolean {
	return matchesLemma(word, text) || Boolean(form && form.trim() && matchesLemma(form, text));
}
