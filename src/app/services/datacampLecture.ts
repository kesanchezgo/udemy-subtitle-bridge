/**
 * Adaptador del sitio DataCamp (app.datacamp.com).
 *
 * La SPA monta las lecciones de vídeo en un iframe cross-origin
 * (projector.datacamp.com) cuyo src lleva `projector_key=course_<id>_<hash>`.
 * Esa key alimenta la API pública del projector, que devuelve el deck con los
 * subtítulos oficiales en WebVTT (16-24 idiomas por vídeo). Las lecciones que
 * no son vídeo (SingleProcessExercise, ChatExercise, …) no tienen ese iframe:
 * la app no aparece ahí.
 *
 * Todo se lee desde el marco superior: la API del projector es pública (sin
 * cookies) y el fetch desde la página funciona (CORS verificado).
 */

export type DataCampSubtitleTrack = { language: string; link: string };

export type DataCampVideoMeta = {
	key: string;
	subtitle_vtt_link?: string | null;
	subtitles?: DataCampSubtitleTrack[] | null;
	slide_deck?: {
		title?: string | null;
		plain_video_mp4_link?: string | null;
		structure?: Array<{ title?: string | null; script?: string | null }> | null;
	} | null;
};

/** Idioma detectado del contenido de un VTT. */
export type DataCampVttLanguage = 'es' | 'en' | 'otro';

export function isDataCampProjectorFrame(): boolean {
	return window.location.hostname === 'projector.datacamp.com';
}

export function isDataCampCampusPage(): boolean {
	return window.location.hostname === 'app.datacamp.com' && /\/campus\/courses\/[^/]+/.test(window.location.pathname);
}

/** El slug del curso: /es/campus/courses/<slug>/<capitulo>?ex=N */
export function getDataCampCourseSlug(): string | null {
	const match = window.location.pathname.match(/\/campus\/courses\/([^/]+)/);
	return match ? match[1] : null;
}

/**
 * La projector_key del vídeo actual, leída del iframe del reproductor.
 * Devuelve null en lecciones que no son vídeo (ahí no hay iframe): es la señal
 * que decide si la app aparece o no.
 */
export function getDataCampProjectorKey(doc: Document = document): string | null {
	const iframe = doc.querySelector('iframe[src*="projector.datacamp.com"]') as HTMLIFrameElement | null;
	const src = iframe?.getAttribute('src') ?? '';
	const match = src.match(/[?&]projector_key=([^&]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

export async function fetchDataCampVideoMeta(key: string): Promise<DataCampVideoMeta | null> {
	try {
		const response = await fetch(`https://projector.datacamp.com/api/videos/${encodeURIComponent(key)}`, { credentials: 'omit' });
		if (!response.ok) return null;
		return (await response.json()) as DataCampVideoMeta;
	} catch {
		return null;
	}
}

export async function fetchText(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, { credentials: 'omit' });
		if (!response.ok) return null;
		return await response.text();
	} catch {
		return null;
	}
}

const ES_MARKERS = /\b(el|la|los|las|un|una|unos|unas|para|con|porque|esto|esto es|muy|también|según|vamos|aprenderás|curso| Aquí|aquí)\b/gi;
const EN_MARKERS = /\b(the|and|you|with|for|that|this|from|are|have|will|your|course|learn|here)\b/gi;

/**
 * Idioma del CONTENIDO de un VTT, no de la etiqueta: en los cursos traducidos
 * DataCamp etiqueta la pista nativa como «English» aunque esté en español.
 */
export function detectVttLanguage(vtt: string): DataCampVttLanguage {
	const lines = vtt
		.split('\n')
		.filter((line) => !/^\s*(WEBVTT|NOTE|STYLE|\d+\s*$)/.test(line) && !line.includes('-->') && line.trim().length > 0)
		.slice(0, 120)
		.join(' ')
		.toLowerCase();
	const es = (lines.match(ES_MARKERS) ?? []).length;
	const en = (lines.match(EN_MARKERS) ?? []).length;
	if (es >= 3 && es > en * 1.5) return 'es';
	if (en >= 3 && en > es * 1.5) return 'en';
	return 'otro';
}

/**
 * El VTT que Kinema debe usar y su idioma REAL (detectado del contenido).
 *  - es  → la pista nativa ya está en español: se muestra tal cual, sin IA.
 *  - en  → pista nativa en inglés: el pipeline de traducción del dock la toma.
 *  - otro→ se usa la pista nativa igual, sin traducción.
 */
export async function resolveDataCampSubtitles(key: string): Promise<{ meta: DataCampVideoMeta; vtt: string; lang: DataCampVttLanguage } | null> {
	const meta = await fetchDataCampVideoMeta(key);
	if (!meta) return null;
	const link = meta.subtitle_vtt_link ?? meta.subtitles?.find((t) => t.language === 'English')?.link ?? null;
	if (!link) return null;
	const vtt = await fetchText(link);
	if (!vtt || !vtt.includes('-->')) return null;
	return { meta, vtt, lang: detectVttLanguage(vtt) };
}

/**
 * Título de la lección: el de la PRIMERA diapositiva del deck (el título del
 * deck es el del CURSO). document.title en DataCamp es «<lección> | …».
 */
export function getDataCampLectureTitleFromMeta(meta: DataCampVideoMeta | null): string | null {
	const firstSlide = meta?.slide_deck?.structure?.[0]?.title?.trim();
	if (firstSlide) return firstSlide;
	const deckTitle = meta?.slide_deck?.title?.trim();
	return deckTitle || null;
}

/** Botón de avance de la SPA (aria-label localizado; matchean es/en). */
export function goToNextDataCampExercise(doc: Document = document): boolean {
	const selectors = [
		'[aria-label="Ir al siguiente ejercicio"]',
		'[aria-label="Go to the next exercise"]',
		'button[aria-label*="siguiente ejercicio" i]',
		'button[aria-label*="next exercise" i]'
	];
	for (const selector of selectors) {
		const button = doc.querySelector(selector) as HTMLButtonElement | null;
		if (button && !button.disabled) {
			button.click();
			return true;
		}
	}
	return false;
}

/**
 * Título y descripción del curso desde la API del outline. El slug de la URL
 * responde aunque la sesión no tenga el curso; con credenciales trae más.
 */
export async function fetchDataCampCourseOutline(slug: string): Promise<{ title?: string; description?: string } | null> {
	try {
		const response = await fetch(`https://campus-api.datacamp.com/api/courses/${encodeURIComponent(slug)}`, { credentials: 'include' });
		if (!response.ok) return null;
		const data = (await response.json()) as { title?: string; short_description?: string; description?: string };
		return { title: data.title, description: data.short_description ?? data.description };
	} catch {
		return null;
	}
}
