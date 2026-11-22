/**
 * La plataforma de una lección, para cualquier sitio: una sola regla para las
 * etiquetas de Anki (kinema::plataforma::…; antes kinema/platform::…), el frontmatter y raw/ de Obsidian,
 * el historial y los prompts. Las conocidas por su nombre; cualquier otra, por
 * el nombre del sitio (coursera.org → «coursera»). Pura (los tests la importan).
 */
const KNOWN: { test: RegExp; id: string; name: string }[] = [
	{ test: /(^|\.)udemy\.com$/, id: 'udemy', name: 'Udemy' },
	{ test: /(^|\.)datacamp\.com$/, id: 'datacamp', name: 'DataCamp' },
];

export function platformOf(url?: string | null): string {
	const href = url ?? (typeof window !== 'undefined' ? window.location.href : '');
	let host = '';
	try { host = new URL(href).hostname.toLowerCase(); } catch { return 'web'; }
	const known = KNOWN.find((k) => k.test.test(host));
	if (known) return known.id;
	// La vista previa del prototipo (localhost) simula una lección de Udemy.
	if (host === 'localhost' || /^[\d.]+$/.test(host) || host === '[::1]') return 'udemy';
	const parts = host.replace(/^www\./, '').split('.').filter(Boolean);
	const site = parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? '';
	return site.replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'web';
}

/** Un id de plataforma guardado (historial): válido si parece uno. */
export const isPlatformId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,24}$/.test(value);

/** Nombre para mostrar: «Udemy», «DataCamp»… o el sitio con mayúscula. */
export function platformName(id?: string | null): string {
	if (!id) return 'la plataforma';
	return KNOWN.find((k) => k.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}
