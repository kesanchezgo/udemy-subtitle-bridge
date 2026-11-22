/**
 * Lado de la interfaz de la fase 3 (el equivalente de ankiBridge): la carpeta
 * asignada a cada curso (registro) y las llamadas al plugin Local REST API a
 * través del service worker (USG_OBSIDIAN_REST).
 *
 * El registro es lo que impide repartir un curso: la primera nota fija su
 * carpeta y las siguientes van ahí aunque cambie el programa activo o la
 * estructura de Ajustes. Cambiarla es una acción explícita («Cambiar» en Fijar
 * o en la Biblioteca), que con Obsidian conectado puede mover las notas.
 */
import { chromeLocalStorage } from './chromeStorage';
import { buildScaffoldNotes, loadObsidianExportConfig, saveObsidianExportConfig, type ObsidianExportConfig } from './obsidianExport';
import {
	OBSIDIAN_COURSE_FOLDERS_KEY, assignedFolderFor, cleanVaultFolder, courseFolderKey, freezeCourseFolders, hasLegacyLayout,
	type CourseFolderAssignment, type CourseFolderRegistry,
} from './obsidianDestination';
import { historyService } from './historyService';
import { DEFAULT_OBSIDIAN_REST_URL, type MoveResult, type NoteInfo, type ObsidianConnection, type ObsidianRestStatus } from './obsidianRestOps';
import type { VaultWrite, WriteOutcome } from './obsidianWriter';

// ── Registro de carpetas por curso ─────────────────────────────────────────

export async function loadCourseFolders(): Promise<CourseFolderRegistry> {
	try {
		const raw = (await chromeLocalStorage.get([OBSIDIAN_COURSE_FOLDERS_KEY]))[OBSIDIAN_COURSE_FOLDERS_KEY];
		return raw && typeof raw === 'object' ? (raw as CourseFolderRegistry) : {};
	} catch {
		return {};
	}
}

export async function saveCourseFolders(registry: CourseFolderRegistry): Promise<void> {
	await chromeLocalStorage.set({ [OBSIDIAN_COURSE_FOLDERS_KEY]: registry });
}

export async function assignCourseFolder(course: string, folder: string, program?: string | null): Promise<CourseFolderAssignment | null> {
	const clean = cleanVaultFolder(folder);
	if (!clean || !courseFolderKey(course)) return null;
	const entry: CourseFolderAssignment = { folder: clean, ...(program ? { program } : {}), at: Date.now() };
	await saveCourseFolders({ ...(await loadCourseFolders()), [courseFolderKey(course)]: entry });
	return entry;
}

/** Tras la primera nota de un curso, su carpeta queda fijada (las siguientes no cambian solas). */
export async function rememberCourseFolder(course: string, folder: string, program?: string | null): Promise<void> {
	if (assignedFolderFor(await loadCourseFolders(), course)) return;
	await assignCourseFolder(course, folder, program);
}

/**
 * Fase 5 · la configuración de Obsidian, ya con la estructura de ahora (una
 * carpeta por curso). Si viene de una versión con «Todas juntas» o «Por
 * programa», ANTES de nada se fija la carpeta de cada curso que ya tiene notas
 * (la de su última nota, o la que le daba la estructura anterior): ningún
 * curso queda repartido entre dos carpetas. Se hace una sola vez.
 */
let migrating: Promise<ObsidianExportConfig> | null = null;
export async function loadObsidianConfig(): Promise<ObsidianExportConfig> {
	const config = await loadObsidianExportConfig();
	if (!hasLegacyLayout(config)) return config;
	if (migrating) return migrating;
	migrating = (async () => {
		try {
			const lectures = (await historyService.listLectures()).filter((l) => !l.deletedAt && l.obsidianExportedAt);
			// La nota más reciente de cada curso manda (su carpeta real).
			const latest = new Map<string, { course: string; programSlug: string | null; notePath: string | null; at: number }>();
			for (const l of lectures) {
				const prev = latest.get(l.courseId);
				const at = l.obsidianExportedAt ?? 0;
				if (!prev || at > prev.at) latest.set(l.courseId, { course: l.courseName, programSlug: l.dcTrackSlug ?? null, notePath: l.obsidianNotePath ?? null, at });
			}
			const registry = await loadCourseFolders();
			const frozen = freezeCourseFolders(registry, config, [...latest.values()]);
			if (Object.keys(frozen).length !== Object.keys(registry).length) await saveCourseFolders(frozen);
			const next: ObsidianExportConfig = { ...config, noteLayout: 'course' };
			await saveObsidianExportConfig(next);
			return next;
		} catch {
			// Si algo falla, se reintenta la próxima vez; mientras, nada se guarda con la estructura nueva.
			return config;
		} finally {
			migrating = null;
		}
	})();
	return migrating;
}

// ── Conexión (plugin Local REST API, vía service worker) ───────────────────

/** La conexión configurada (URL local + clave) o null si no hay clave. */
export function restConnectionOf(config: Pick<ObsidianExportConfig, 'restUrl' | 'restApiKey'>): ObsidianConnection | null {
	const apiKey = (config.restApiKey ?? '').trim();
	return apiKey ? { url: (config.restUrl ?? '').trim() || DEFAULT_OBSIDIAN_REST_URL, apiKey } : null;
}

type Transport = (message: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
type ChromeLike = { runtime?: { id?: string; sendMessage?: (msg: unknown, cb: (res: unknown) => void) => void; lastError?: unknown } };

const chromeTransport: Transport = (message) => {
	const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;
	if (!chromeApi?.runtime?.id || !chromeApi.runtime.sendMessage) return Promise.resolve(null);
	return new Promise((resolve) => {
		try {
			chromeApi.runtime!.sendMessage!(message, (res) => resolve(chromeApi.runtime?.lastError ? null : ((res ?? null) as Record<string, unknown> | null)));
		} catch {
			resolve(null);
		}
	});
};

let transport: Transport = chromeTransport;
/** Solo para pruebas: un vault simulado en la vista previa. */
export function setObsidianTransport(next: Transport | null): void {
	transport = next ?? chromeTransport;
}

/** Obsidian no está al otro lado (cerrado, sin el plugin o sin la extensión): toca obsidian://. */
export class ObsidianUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ObsidianUnavailableError';
	}
}

async function call(op: string, payload: Record<string, unknown> = {}, connection?: ObsidianConnection | null): Promise<Record<string, unknown>> {
	const conn = connection ?? restConnectionOf(await loadObsidianExportConfig());
	if (!conn) throw new ObsidianUnavailableError('Sin conexión directa con Obsidian configurada.');
	const res = await transport({ type: 'USG_OBSIDIAN_REST', op, connection: conn, ...payload });
	if (!res) throw new ObsidianUnavailableError('Kinema solo habla con Obsidian desde la extensión.');
	if (!res.ok) {
		const message = String(res.error || 'Obsidian no respondió.');
		if (res.unreachable) throw new ObsidianUnavailableError(message);
		throw new Error(message);
	}
	return res;
}

/** null = sin clave o sin extensión (vista previa): la UI sigue con obsidian://. */
export async function obsidianStatus(connection?: ObsidianConnection | null): Promise<ObsidianRestStatus | null> {
	try {
		return ((await call('status', {}, connection)).status as ObsidianRestStatus) ?? null;
	} catch (error) {
		if (error instanceof ObsidianUnavailableError && /extensión|configurada/.test(error.message)) return null;
		return { available: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Escribe en el vault (todo de una vez). Lanza ObsidianUnavailableError si Obsidian no está. */
export async function obsidianWrites(writes: VaultWrite[]): Promise<WriteOutcome[]> {
	return ((await call('writes', { writes })).outcomes as WriteOutcome[]) ?? [];
}

export async function obsidianReadNote(path: string): Promise<NoteInfo> {
	return ((await call('read', { path })).note as NoteInfo) ?? { exists: false };
}

export async function obsidianListFolder(folder: string): Promise<string[]> {
	return ((await call('list', { folder })).files as string[]) ?? [];
}

export async function obsidianOpenNote(path: string): Promise<void> {
	await call('open', { path });
}

export async function obsidianMoveNotes(moves: Array<{ from: string; to: string }>): Promise<MoveResult[]> {
	return ((await call('move', { moves })).results as MoveResult[]) ?? [];
}

// ── Fase 5.1 · el vault, listo sin pasos manuales ──────────────────────────

export interface VaultPreparation {
	created: number;
	kept: number;
	failed: number;
	error?: string;
}

let preparing: Promise<VaultPreparation | null> | null = null;

/**
 * Crea en el vault lo que falte de la estructura de Kinema (índice, registro,
 * plantillas, CLAUDE.md / AGENTS.md) con la conexión directa: nunca pisa una
 * nota que ya existe («createIfMissing»). Sin `force`, solo si «Preparar el
 * vault» está encendido y aún no se hizo; después queda la fecha y no se
 * repite. null = no tocaba (apagado, ya hecho o sin conexión configurada).
 * Lanza ObsidianUnavailableError si Obsidian no responde (se reintenta luego).
 */
export async function prepareVaultIfNeeded(options: { force?: boolean } = {}): Promise<VaultPreparation | null> {
	if (preparing) return preparing;
	preparing = (async () => {
		const config = await loadObsidianExportConfig();
		if (!restConnectionOf(config)) return null;
		if (!options.force && (config.prepareVault !== true || config.vaultPreparedAt)) return null;
		const outcomes = await obsidianWrites(buildScaffoldNotes().map((note) => ({ kind: 'scaffold' as const, mode: 'createIfMissing' as const, note })));
		const result: VaultPreparation = {
			created: outcomes.filter((o) => o.result === 'created').length,
			kept: outcomes.filter((o) => o.result === 'kept' || o.result === 'exists').length,
			failed: outcomes.filter((o) => o.result === 'failed').length,
			error: outcomes.find((o) => o.error)?.error,
		};
		if (!result.failed) await saveObsidianExportConfig({ ...(await loadObsidianExportConfig()), vaultPreparedAt: Date.now() });
		return result;
	})().finally(() => { preparing = null; });
	return preparing;
}
