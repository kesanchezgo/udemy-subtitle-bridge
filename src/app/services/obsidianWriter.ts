/**
 * Sistema de escritura en el vault (fase 3): QUÉ se escribe se decide una sola
 * vez (planLessonWrites) y CÓMO depende del camino disponible:
 *
 *  · Obsidian conectado (plugin Local REST API): runVaultWrites lo escribe todo
 *    de una vez desde el service worker — nota, índice del curso, MOC del
 *    programa y transcripción —, sabiendo qué existe de verdad en el vault.
 *  · Sin conexión: obsidian://new, una URI por clic (Chrome no deja más). La
 *    primera escritura se abre al momento y el resto se ofrece en el aviso, cada
 *    una con su clic (uriWrite).
 *
 * Las dos rutas escriben EXACTAMENTE el mismo markdown (los builders de
 * obsidianExport), así que una nota no cambia según cómo se guardó.
 *
 * Reglas de no pisar (iguales en las dos rutas):
 *  · create          — la nota de la lección; si ya existe, NO se escribe («exists»).
 *  · replace         — solo con «Reemplazar» explícito.
 *  · append          — el «Repaso · fecha» al final de una nota que ya existe.
 *  · createIfMissing — índice del curso y transcripción (raw/ es inmutable).
 *  · managed         — MOC del programa: si existe, solo se reescribe su bloque
 *                      entre marcas; sin marcas (MOC antiguo), no se toca.
 */
import {
	buildCourseMocMarkdown, buildProgramMocMarkdown, buildRawSrtNoteMarkdown, buildRawSrtNotePath,
	buildSessionNoteMarkdown, buildSessionUpdateMarkdown, replaceManagedBlock, slugifyVault,
	type ObsidianExportConfig, type ObsidianProgramData, type ObsidianSessionData, type VaultNote,
} from './obsidianExport.ts';
import { courseMocPathFor, programMocPathFor, sessionNotePathIn, sourcesRoot, mocsRoot } from './obsidianDestination.ts';
import { appendNote, readNote, writeNote, type RestRequest } from './obsidianRestOps.ts';

export type WriteKind = 'session' | 'review' | 'courseMoc' | 'programMoc' | 'raw' | 'scaffold';
export type WriteMode = 'create' | 'replace' | 'append' | 'createIfMissing' | 'managed';
export type WriteResult = 'created' | 'replaced' | 'appended' | 'updated' | 'kept' | 'exists' | 'failed';

export interface VaultWrite {
	kind: WriteKind;
	mode: WriteMode;
	note: VaultNote;
}

export interface WriteOutcome {
	kind: WriteKind;
	path: string;
	result: WriteResult;
	error?: string;
}

export type LessonIntent = 'create' | 'replace' | 'append';

export interface LessonPlanInput {
	data: ObsidianSessionData;
	config: ObsidianExportConfig;
	/** Carpeta del curso (obsidianDestination.courseNoteFolder). */
	folder: string;
	intent: LessonIntent;
	/** Programa con su lista de cursos (DataCamp): MOC del programa. */
	program?: ObsidianProgramData | null;
	/** Transcripción (SRT EN) para raw/, si se pidió y llegó. */
	srt?: string;
	today?: Date;
}

/** Plataforma de la nota (raw/<plataforma>/…): la de la lección, nunca una fija. */
export const platformOf = (data: Pick<ObsidianSessionData, 'platform'>) => slugifyVault(data.platform || 'curso', 24);

/** Todo lo que se escribe al guardar una lección, en orden (la nota primero). */
export function planLessonWrites(input: LessonPlanInput): VaultWrite[] {
	const { data, config, folder, intent, program, srt, today } = input;
	const path = sessionNotePathIn(folder, data.courseName, data.lessonName);
	const writes: VaultWrite[] = [
		intent === 'append'
			? { kind: 'review', mode: 'append', note: { path, markdown: buildSessionUpdateMarkdown(data, { today }) } }
			: { kind: 'session', mode: intent, note: { path, markdown: buildSessionNoteMarkdown(data, config, { today }) } },
		{
			kind: 'courseMoc',
			mode: 'createIfMissing',
			note: {
				path: courseMocPathFor(config, data.courseName),
				markdown: buildCourseMocMarkdown(data.courseName, { platform: data.platform, objective: data.objective, today, sourcesFolder: sourcesRoot(config) }),
			},
		},
	];
	if (program?.slug && program.title) {
		writes.push({
			kind: 'programMoc',
			mode: 'managed',
			note: {
				path: programMocPathFor(config, program.slug),
				markdown: buildProgramMocMarkdown(program, { today, sourcesFolder: sourcesRoot(config), mocsFolder: mocsRoot(config) }),
			},
		});
	}
	if (srt && srt.trim()) {
		const platform = platformOf(data);
		writes.push({
			kind: 'raw',
			mode: 'createIfMissing',
			note: {
				path: buildRawSrtNotePath(data.courseName, data.lessonName, { platform }),
				markdown: buildRawSrtNoteMarkdown(data.courseName, data.lessonName, srt, { platform, sourceUrl: data.sourceUrl, today }),
			},
		});
	}
	return writes;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Una escritura con el plugin, respetando las reglas de no pisar. */
export async function runVaultWrite(request: RestRequest, write: VaultWrite): Promise<WriteOutcome> {
	const { kind, mode, note } = write;
	const done = (result: WriteResult): WriteOutcome => ({ kind, path: note.path, result });
	try {
		if (mode === 'replace') { await writeNote(request, note.path, note.markdown); return done('replaced'); }
		if (mode === 'append') { await appendNote(request, note.path, `\n${note.markdown.trim()}\n`); return done('appended'); }
		const current = await readNote(request, note.path);
		if (!current.exists) { await writeNote(request, note.path, note.markdown); return done('created'); }
		if (mode === 'create') return done('exists');
		if (mode === 'createIfMissing') return done('kept');
		// managed: solo el bloque entre marcas; si no las tiene, la nota es del estudiante.
		const merged = replaceManagedBlock(current.content ?? '', note.markdown);
		if (merged === null || merged === current.content) return done('kept');
		await writeNote(request, note.path, merged);
		return done('updated');
	} catch (error) {
		return { kind, path: note.path, result: 'failed', error: errorText(error) };
	}
}

/** Todas en orden; si la nota de la lección falla o ya existe, lo demás no se escribe. */
export async function runVaultWrites(request: RestRequest, writes: VaultWrite[]): Promise<WriteOutcome[]> {
	const out: WriteOutcome[] = [];
	for (const write of writes) {
		const outcome = await runVaultWrite(request, write);
		out.push(outcome);
		const isLesson = write.kind === 'session' || write.kind === 'review';
		if (isLesson && (outcome.result === 'failed' || outcome.result === 'exists')) break;
	}
	return out;
}

/** Opciones de obsidian://new para una escritura (sin conexión: una por clic). */
export function uriOptionsFor(write: VaultWrite): { overwrite?: boolean; append?: boolean } {
	if (write.mode === 'append') return { append: true };
	// «Reemplazar» explícito y el MOC del programa (su clic «Actualizar MOC» lo rehace, como antes).
	if (write.mode === 'replace' || write.kind === 'programMoc') return { overwrite: true };
	return {};
}

export interface WriteSummary {
	/** Lo que se dice en el aviso: «Nota creada · índice del curso · transcripción». */
	title: string;
	description: string;
	failed: WriteOutcome[];
	lesson: WriteOutcome | null;
}

const KIND_LABEL: Record<WriteKind, string> = {
	session: 'nota', review: 'repaso', courseMoc: 'índice del curso', programMoc: 'MOC del programa', raw: 'transcripción', scaffold: 'estructura',
};

/** El aviso tras escribir con el plugin: lo que pasó de verdad, sin adornos. */
export function summarizeWrites(outcomes: WriteOutcome[]): WriteSummary {
	const lesson = outcomes.find((o) => o.kind === 'session' || o.kind === 'review') ?? null;
	const failed = outcomes.filter((o) => o.result === 'failed');
	const title = !lesson ? 'Guardado en Obsidian'
		: lesson.result === 'failed' ? 'No se pudo guardar la nota'
			: lesson.result === 'exists' ? 'Esta lección ya tiene nota'
				: lesson.result === 'appended' ? 'Repaso añadido a la nota'
					: lesson.result === 'replaced' ? 'Nota reemplazada'
						: 'Nota guardada en Obsidian';
	const extras = outcomes
		.filter((o) => o !== lesson && (o.result === 'created' || o.result === 'updated'))
		.map((o) => `${KIND_LABEL[o.kind]} ${o.result === 'updated' ? 'actualizado' : 'creado'}`.replace('transcripción creado', 'transcripción guardada'));
	const folder = lesson ? lesson.path.split('/').slice(0, -1).join('/') : '';
	const parts = [
		lesson && lesson.result !== 'failed' && lesson.result !== 'exists' ? `En ${folder}/` : '',
		...extras,
		failed.length && lesson?.result !== 'failed' ? `falló: ${failed.map((o) => KIND_LABEL[o.kind]).join(', ')}` : '',
		lesson?.result === 'failed' ? lesson.error ?? '' : '',
	].filter(Boolean);
	return { title, description: parts.join(' · '), failed, lesson };
}
