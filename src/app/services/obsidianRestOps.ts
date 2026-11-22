/**
 * Obsidian conectado (fase 3): las operaciones del plugin «Local REST API»
 * (coddingtonbear/obsidian-local-rest-api), con la petición inyectada — el
 * service worker les pasa su fetch real y los tests, un vault falso. Es el
 * equivalente de ankiConnectOps para Obsidian.
 *
 * Por qué este plugin: es el único camino que escribe en el vault sin pasar por
 * el protocolo obsidian://. Con él:
 *   · una exportación escribe la nota, el índice del curso, el MOC del programa
 *     y la transcripción de una vez (obsidian:// solo deja una URI por clic);
 *   · se sabe si una nota existe DE VERDAD (no solo lo que Kinema recuerda);
 *   · nunca aparece «nombre 1.md» y las notas largas no pasan por el portapapeles;
 *   · mover una nota usa el renombrado de Obsidian, que actualiza los enlaces.
 *
 * Solo este ordenador: la URL tiene que ser 127.0.0.1, localhost o [::1]. El
 * vault nunca viaja a un servidor ajeno. Por defecto el servidor HTTP del plugin
 * (127.0.0.1:27123, «Enable Non-encrypted (HTTP) Server»): el HTTPS usa un
 * certificado propio en el que Chrome no confía sin instalarlo a mano.
 *
 * Contrato verificado contra el código del plugin (v5.5.2, 2026-11):
 *   GET  /                    → { status: "OK", authenticated, versions: { self, obsidian } } (sin clave)
 *   GET  /vault/<ruta>        → nota; con Accept application/vnd.olrapi.note+json,
 *                               { content, frontmatter, stat: { ctime, mtime, size } }; 404 si no existe
 *   GET  /vault/<carpeta>/    → { files: [...] } un nivel (subcarpetas con «/»); 404 si está vacía
 *   PUT  /vault/<ruta>        → crea o reemplaza (crea las carpetas que falten); 204
 *   POST /vault/<ruta>        → añade al final (crea la nota si no existe); 204
 *   MOVE /vault/<ruta>        → cabecera Destination (codificada); usa fileManager.renameFile,
 *                               que actualiza los enlaces. Versiones antiguas: 404/405
 *   POST /open/<ruta>         → abre la nota en Obsidian
 */

export const DEFAULT_OBSIDIAN_REST_URL = 'http://127.0.0.1:27123';
export const NOTE_JSON = 'application/vnd.olrapi.note+json';

export interface ObsidianConnection {
	url: string;
	apiKey: string;
}

export interface RestResponse {
	status: number;
	body: string;
}

export type RestRequest = (
	method: string,
	path: string,
	options?: { body?: string; accept?: string; headers?: Record<string, string> },
) => Promise<RestResponse>;

export interface ObsidianRestStatus {
	/** El plugin responde en esa URL. */
	available: boolean;
	/** La clave es la del plugin (sin ella, solo responde GET /). */
	authenticated?: boolean;
	/** Versión del plugin. */
	version?: string;
	/** Versión de Obsidian. */
	obsidian?: string;
	error?: string;
}

export interface NoteInfo {
	exists: boolean;
	content?: string;
	/** Última modificación en el vault (ms). */
	mtime?: number;
	ctime?: number;
	frontmatter?: Record<string, unknown>;
}

export type MoveResult = 'moved' | 'missing' | 'exists' | 'unsupported';

export class ObsidianRestError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** La URL del plugin, solo si es de este ordenador (si no, null). Sin ruta ni barra final. */
export function normalizeRestUrl(raw: string | undefined | null): string | null {
	const text = String(raw ?? '').trim() || DEFAULT_OBSIDIAN_REST_URL;
	let url: URL;
	try {
		url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (!LOOPBACK.has(url.hostname)) return null;
	return `${url.protocol}//${url.host}`;
}

/** Conexión válida (URL local y clave) o null. */
export function normalizeConnection(raw: unknown): ObsidianConnection | null {
	const value = (raw ?? {}) as Partial<ObsidianConnection>;
	const url = normalizeRestUrl(value.url);
	const apiKey = String(value.apiKey ?? '').trim();
	return url && apiKey ? { url, apiKey } : null;
}

/** Ruta del vault → ruta del API, cada segmento codificado («/» separa carpetas). */
export function vaultApiPath(path: string, folder = false): string {
	const segments = String(path || '').split('/').map((s) => s.trim()).filter(Boolean);
	const joined = segments.map(encodeURIComponent).join('/');
	return `/vault/${joined}${folder && joined ? '/' : ''}`;
}

/** La petición real: el service worker le pasa su fetch (y los tests, uno falso). */
export function fetchRequest(connection: ObsidianConnection, fetchImpl: typeof fetch, timeoutMs = 8000): RestRequest {
	return async (method, path, options = {}) => {
		const headers: Record<string, string> = { Authorization: `Bearer ${connection.apiKey}`, ...(options.headers ?? {}) };
		if (options.body !== undefined) headers['Content-Type'] = 'text/markdown; charset=utf-8';
		if (options.accept) headers.Accept = options.accept;
		const res = await fetchImpl(`${connection.url}${path}`, {
			method,
			headers,
			body: options.body,
			signal: AbortSignal.timeout(timeoutMs),
		});
		return { status: res.status, body: await res.text().catch(() => '') };
	};
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Un mensaje que el estudiante entiende, a partir de la respuesta del plugin. */
export function describeRestFailure(res: RestResponse): string {
	if (res.status === 401 || res.status === 403) return 'Obsidian rechazó la clave. Cópiala de nuevo desde Ajustes → Local REST API.';
	if (res.status === 429) return 'Demasiados intentos con una clave incorrecta: espera un minuto.';
	let detail = '';
	try {
		detail = String((JSON.parse(res.body) as { message?: unknown })?.message ?? '');
	} catch {
		/* cuerpo sin JSON */
	}
	return `Obsidian respondió ${res.status}${detail ? `: ${detail}` : ''}`;
}

function ensureOk(res: RestResponse): void {
	if (res.status >= 200 && res.status < 300) return;
	throw new ObsidianRestError(describeRestFailure(res), res.status);
}

/** ¿El plugin responde y acepta la clave? Nunca lanza: lo que pasó va en `error`. */
export async function restStatus(request: RestRequest): Promise<ObsidianRestStatus> {
	try {
		const res = await request('GET', '/');
		if (res.status !== 200) return { available: false, error: describeRestFailure(res) };
		const json = JSON.parse(res.body) as { status?: string; authenticated?: boolean; versions?: { self?: string; obsidian?: string } };
		if (json?.status !== 'OK') return { available: false, error: 'En esa dirección responde otra cosa, no el plugin Local REST API.' };
		return {
			available: true,
			authenticated: json.authenticated === true,
			version: typeof json.versions?.self === 'string' ? json.versions.self : undefined,
			obsidian: typeof json.versions?.obsidian === 'string' ? json.versions.obsidian : undefined,
		};
	} catch (error) {
		return { available: false, error: errorText(error) };
	}
}

export async function readNote(request: RestRequest, path: string): Promise<NoteInfo> {
	const res = await request('GET', vaultApiPath(path), { accept: NOTE_JSON });
	if (res.status === 404) return { exists: false };
	ensureOk(res);
	try {
		const json = JSON.parse(res.body) as { content?: unknown; stat?: { mtime?: unknown; ctime?: unknown }; frontmatter?: unknown };
		return {
			exists: true,
			content: typeof json.content === 'string' ? json.content : '',
			mtime: typeof json.stat?.mtime === 'number' ? json.stat.mtime : undefined,
			ctime: typeof json.stat?.ctime === 'number' ? json.stat.ctime : undefined,
			frontmatter: json.frontmatter && typeof json.frontmatter === 'object' ? (json.frontmatter as Record<string, unknown>) : undefined,
		};
	} catch {
		// Versión que ignora el Accept y devuelve el texto tal cual.
		return { exists: true, content: res.body };
	}
}

/** Lo que hay en una carpeta (un nivel; las subcarpetas terminan en «/»). Vacía o inexistente: []. */
export async function listFolder(request: RestRequest, folder: string): Promise<string[]> {
	const res = await request('GET', vaultApiPath(folder, true));
	if (res.status === 404) return [];
	ensureOk(res);
	const files = (JSON.parse(res.body) as { files?: unknown })?.files;
	return Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : [];
}

export async function writeNote(request: RestRequest, path: string, markdown: string): Promise<void> {
	ensureOk(await request('PUT', vaultApiPath(path), { body: markdown }));
}

export async function appendNote(request: RestRequest, path: string, markdown: string): Promise<void> {
	ensureOk(await request('POST', vaultApiPath(path), { body: markdown }));
}

/**
 * Mueve una nota con el renombrado de Obsidian (actualiza los enlaces). Nunca
 * pisa: si el destino existe, no se toca nada. Si el plugin es anterior a MOVE,
 * «unsupported» y la nota sigue donde estaba.
 */
export async function moveNote(request: RestRequest, from: string, to: string): Promise<MoveResult> {
	if (from === to) return 'moved';
	if (!(await readNote(request, from)).exists) return 'missing';
	if ((await readNote(request, to)).exists) return 'exists';
	const res = await request('MOVE', vaultApiPath(from), { headers: { Destination: encodeURIComponent(to) } });
	if (res.status >= 200 && res.status < 300) return 'moved';
	// La nota existe (lo acabamos de ver): un 404/405 aquí es que el método no existe en esa versión.
	if (res.status === 404 || res.status === 405 || res.status === 501) return 'unsupported';
	throw new ObsidianRestError(describeRestFailure(res), res.status);
}

export async function openInObsidian(request: RestRequest, path: string): Promise<void> {
	const res = await request('POST', `/open/${String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/')}`);
	ensureOk(res);
}
