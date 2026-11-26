const CJK_TEST_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const CJK_SPAN_RE = /([ \t]*)[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+([ \t]*)/g;

export function hasCjkText(text: string | undefined | null): boolean {
	return CJK_TEST_RE.test(String(text ?? ''));
}

/**
 * Modelos multilingües chino-ingleses (p. ej. Hunyuan/Qwen con reasoningOff)
 * a veces filtran un token CJK aislado («¿Qué的两 archivos…») en español.
 * Si la lección de origen NO contiene escritura CJK, limpia esos glifos y
 * normaliza solo los espacios adyacentes sin tocar saltos de línea ni indentación.
 */
export function cleanStrayCjk(text: string, allowCjk = false): string {
	const raw = String(text ?? '');
	if (allowCjk || !hasCjkText(raw)) return raw;
	return raw.replace(CJK_SPAN_RE, (match, lead: string, trail: string, offset: number, str: string) => {
		const prev = offset > 0 ? str[offset - 1] : '';
		const nextIdx = offset + match.length;
		const next = nextIdx < str.length ? str[nextIdx] : '';
		if ((!prev || prev === '\n') && lead) return next && next !== '\n' ? lead : '';
		if (!prev || prev === '\n' || !next || next === '\n') return '';
		if (/^[.,;:?!»"”)\]]/.test(next) || /[«"“(\[¿¡]$/.test(prev)) return '';
		if (lead || trail || (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9`*]/.test(prev) && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9`*]/.test(next))) {
			return ' ';
		}
		return '';
	});
}
