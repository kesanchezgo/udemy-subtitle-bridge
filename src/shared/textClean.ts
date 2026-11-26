const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+/g;

export function hasCjkText(text: string | undefined | null): boolean {
	return CJK_RE.test(String(text ?? ''));
}

/**
 * Modelos multilingües chino-ingleses (p. ej. Hunyuan/Qwen con reasoningOff)
 * a veces filtran un token CJK aislado («¿Qué的两 archivos…») en español.
 * Si la lección de origen NO contiene escritura CJK, limpia esos glifos y
 * normaliza los espacios adyacentes sin alterar saltos de línea.
 */
export function cleanStrayCjk(text: string, allowCjk = false): string {
	const raw = String(text ?? '');
	if (allowCjk || !hasCjkText(raw)) return raw;
	return raw
		.replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡])[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, '$1 ')
		.replace(CJK_RE, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}
