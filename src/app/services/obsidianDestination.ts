/**
 * Dónde van las notas de Obsidian — fuente ÚNICA de verdad (fase 3, fijada en
 * la 5), el equivalente de ankiDestination: Fijar, el guardado al terminar,
 * Ajustes, la Biblioteca y la nota misma (enlaces, MOCs) leen la carpeta de aquí.
 *
 * Estructura (fase 5: sin opciones, la misma idea que en Anki):
 *   <Lecciones>/<curso>/<curso>---<lección>.md   una carpeta por curso
 *   <Cursos>/<curso>.md                          índice del curso (MOC)
 *   <Cursos>/moc-<programa>.md                   MOC de cada programa
 * La carpeta es el contenedor (una nota está en UNA carpeta, como una tarjeta
 * en un mazo). Lo que se cruza va en propiedades, enlaces y etiquetas: un
 * curso puede estar en varios programas (N:M), así que el programa es un MOC
 * que enlaza sus cursos y la propiedad `programas` de cada sesión, no una
 * carpeta (una carpeta por programa obligaría a elegir uno o a duplicar).
 *
 * El NOMBRE de la nota no cambia nunca (<curso>---<lección>.md, el contrato del
 * CLAUDE.md del vault): los enlaces por nombre siguen funcionando aunque la nota
 * cambie de carpeta, y los índices encuentran las sesiones por etiqueta y
 * propiedades (kinema/sesion, course, programas), no por carpeta.
 *
 * Registro por curso: la primera nota de un curso fija su carpeta y las demás
 * van ahí — un curso nunca acaba repartido entre dos carpetas. Los cursos que
 * ya tenían notas con una estructura anterior («Todas juntas», «Por programa»)
 * se quedan en su carpeta (legacyCourseFolder + freezeCourseFolders). Cambiarla
 * es una acción explícita («Cambiar» en Fijar o en la Biblioteca) que, con
 * Obsidian conectado, puede mover las notas que ya existen.
 */
import { kinemaSlug } from './ankiDesign.ts';

/** @deprecated Fase 5: siempre una carpeta por curso. Se lee para no mover los cursos que ya tenían notas. */
export type NoteLayout = 'flat' | 'course' | 'program';

export interface ObsidianLayoutConfig {
	sourcesFolder: string;
	mocsFolder: string;
	/** @deprecated Fase 5: se ignora al guardar notas nuevas (solo sirve para fijar los cursos de antes). */
	noteLayout?: NoteLayout;
}

export interface CourseFolderAssignment {
	folder: string;
	/** Programa (slug) con el que se fijó: solo informativo, el curso NO cambia de carpeta. */
	program?: string;
	at: number;
}
export type CourseFolderRegistry = Record<string, CourseFolderAssignment>;

export const OBSIDIAN_COURSE_FOLDERS_KEY = 'obsidian_course_folders';
export const DEFAULT_SOURCES_FOLDER = 'wiki/fuentes';
export const DEFAULT_MOCS_FOLDER = 'cursos';

/** kebab-case, sin tildes, minúsculas (el mismo criterio que slugifyVault). */
export function vaultSlug(text: string, maxLen = 64): string {
	const stripped = String(text || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return stripped.slice(0, maxLen).replace(/-+$/g, '') || 'sin-nombre';
}

/** Para nombres de CARPETA nuevos: «C++» y «C#» no acaban en la misma («c»). */
export function folderSlug(text: string): string {
	return vaultSlug(String(text || '').replace(/\+/g, ' plus ').replace(/([a-z])#/gi, '$1 sharp '));
}

/** Clave del registro: la misma que el de mazos de Anki (y la etiqueta kinema::curso). */
export const courseFolderKey = (course: string) => kinemaSlug(course);

/**
 * Una carpeta del vault segura: relativa, sin «..» ni «.», sin caracteres de
 * control y sin barras sobrantes. Vacía si no queda nada. No renombra nada más:
 * las carpetas que el estudiante ya usaba siguen dando la misma ruta.
 */
export function cleanVaultFolder(folder: string): string {
	return String(folder || '')
		.replace(/\\/g, '/')
		.split('/')
		.map((segment) => segment.replace(/[\u0000-\u001f]/g, '').trim())
		.filter((segment) => segment && segment !== '.' && segment !== '..')
		.join('/');
}

export const sourcesRoot = (config: Pick<ObsidianLayoutConfig, 'sourcesFolder'>) => cleanVaultFolder(config.sourcesFolder) || DEFAULT_SOURCES_FOLDER;
export const mocsRoot = (config: Pick<ObsidianLayoutConfig, 'mocsFolder'>) => cleanVaultFolder(config.mocsFolder) || DEFAULT_MOCS_FOLDER;

/** La carpeta de Kinema de un curso: <Lecciones>/<curso>/ (el programa no la cambia). */
export function defaultCourseFolder(config: ObsidianLayoutConfig, course: string, _programSlug?: string | null): string {
	return `${sourcesRoot(config)}/${folderSlug(course)}`;
}

/**
 * La carpeta que tenía un curso con la estructura de antes (solo para fijar,
 * al actualizar, los cursos que ya tenían notas: no se mueven solos).
 */
export function legacyCourseFolder(config: ObsidianLayoutConfig, course: string, programSlug?: string | null): string {
	const root = sourcesRoot(config);
	const layout = config.noteLayout ?? 'flat';
	if (layout === 'flat') return root;
	if (layout === 'program' && programSlug) return `${root}/${folderSlug(programSlug)}/${folderSlug(course)}`;
	return `${root}/${folderSlug(course)}`;
}

export function assignedFolderFor(registry: CourseFolderRegistry | null | undefined, course: string): CourseFolderAssignment | null {
	const entry = registry?.[courseFolderKey(course)];
	return entry && cleanVaultFolder(entry.folder) ? entry : null;
}

export interface CourseFolder {
	folder: string;
	/** ¿Fijada en el registro (primera nota o «Cambiar»)? */
	assigned: boolean;
	/** La que tocaría por Ajustes (para «volver a la de Kinema»). */
	defaultFolder: string;
}

/** La carpeta de un curso: la fijada, si la hay; si no, la de Ajustes. */
export function courseNoteFolder(
	config: ObsidianLayoutConfig,
	registry: CourseFolderRegistry | null | undefined,
	course: string,
	programSlug?: string | null,
): CourseFolder {
	const defaultFolder = defaultCourseFolder(config, course, programSlug);
	const assigned = assignedFolderFor(registry, course);
	return { folder: assigned ? cleanVaultFolder(assigned.folder) : defaultFolder, assigned: Boolean(assigned), defaultFolder };
}

/** El nombre de la nota de una lección (no depende de la carpeta). */
export const sessionNoteFileName = (course: string, lesson: string) => `${vaultSlug(course)}---${vaultSlug(lesson)}.md`;

export const sessionNotePathIn = (folder: string, course: string, lesson: string) =>
	`${cleanVaultFolder(folder) || DEFAULT_SOURCES_FOLDER}/${sessionNoteFileName(course, lesson)}`;

/** Índice del curso y MOC del programa: siempre en la carpeta de cursos (un solo sitio). */
export const courseMocPathFor = (config: Pick<ObsidianLayoutConfig, 'mocsFolder'>, course: string) => `${mocsRoot(config)}/${vaultSlug(course)}.md`;
export const programMocPathFor = (config: Pick<ObsidianLayoutConfig, 'mocsFolder'>, programSlug: string) => `${mocsRoot(config)}/moc-${vaultSlug(programSlug)}.md`;

export const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');
export const fileOf = (path: string) => path.split('/').pop() ?? path;

/** Cómo se ve la estructura en Ajustes (con marcadores, sin inventar nombres). */
export function layoutPreview(config: ObsidianLayoutConfig): string {
	return `${sourcesRoot(config)}/‹curso›/‹curso›---‹lección›.md`;
}

export interface NoteMove {
	lessonId: string;
	from: string;
	to: string;
}

/** Qué notas mover al cambiar la carpeta de un curso (solo las que están en otra). */
export function folderMovePlan(notes: Array<{ lessonId: string; path: string }>, folder: string): NoteMove[] {
	const target = cleanVaultFolder(folder);
	if (!target) return [];
	return notes
		.filter((n) => n.path && folderOf(n.path) !== target)
		.map((n) => ({ lessonId: n.lessonId, from: n.path, to: `${target}/${fileOf(n.path)}` }));
}

/**
 * Al cambiar la carpeta de lecciones en Ajustes (o al pasar de una estructura
 * anterior a la de ahora), los cursos que YA tienen notas se quedan donde
 * están: se fija su carpeta — la real de su última nota si se conoce o, si no,
 * la que les daba la configuración anterior. Devuelve el registro nuevo (sin
 * tocar los cursos ya fijados).
 */
export function freezeCourseFolders(
	registry: CourseFolderRegistry,
	previous: ObsidianLayoutConfig,
	courses: Array<{ course: string; programSlug?: string | null; notePath?: string | null }>,
	now = Date.now(),
): CourseFolderRegistry {
	const next = { ...registry };
	for (const { course, programSlug, notePath } of courses) {
		const key = courseFolderKey(course);
		if (!key || next[key]) continue;
		const real = notePath ? cleanVaultFolder(folderOf(notePath)) : '';
		next[key] = { folder: real || legacyCourseFolder(previous, course, programSlug), ...(programSlug ? { program: programSlug } : {}), at: now };
	}
	return next;
}

/** ¿Esta configuración trae una estructura anterior que haya que fijar antes de seguir? */
export const hasLegacyLayout = (config: ObsidianLayoutConfig) => Boolean(config.noteLayout) && config.noteLayout !== 'course';
