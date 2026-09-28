/**
 * Núcleo PURO del builder .apkg (spec → buffer SQLite de collection.anki2).
 *
 * Sin dependencias de Vite ni de chrome: se importa tal cual desde la
 * extensión y desde los scripts de QA en Node (type stripping), de modo que
 * los tests ejercitan EXACTAMENTE el código de producción. El glue del wasm y
 * el zip vive en ankiApkg.ts.
 *
 * El formato es el legacy schema 11 (collection.anki2) que el importador de
 * Anki acepta: los mazos apuntan a presets por ID; si el ID ya existe en la
 * colección destino NO se sobreescribe nada ajeno (nuestros IDs son únicos).
 */

import { stableNumericId } from './ankiDesign';

export interface ApkgTemplateSpec {
	name: string;
	qfmt: string;
	afmt: string;
}

export interface ApkgModelSpec {
	id: number;
	name: string;
	/** Primer campo = campo de orden/búsqueda. */
	fields: readonly string[];
	templates: ApkgTemplateSpec[];
	css: string;
	sortf?: number;
}

export interface ApkgDeckSpec {
	name: string;
	/** ID del preset (dconf) al que apunta este mazo. */
	conf: number;
	desc?: string;
}

export interface ApkgConfSpec {
	id: number;
	name: string;
	config: Record<string, unknown>;
}

export interface ApkgNoteSpec {
	modelName: string;
	deck: string;
	guid: string;
	/** Un valor por campo del note type, en orden. */
	fields: string[];
	tags?: string[];
}

export interface ApkgSpec {
	decks: ApkgDeckSpec[];
	models: ApkgModelSpec[];
	dconfs: ApkgConfSpec[];
	notes: ApkgNoteSpec[];
}

export function fieldsJoin(values: string[]) {
	return values.map((value) => String(value ?? '').replace(/\x1f/g, ' ')).join('\x1f');
}

export function stableGuid(input: string) {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return `usb${hash.toString(36)}`;
}

// Advances on every apkg build so ids never repeat within a session, even when
// two exports happen in the same wall-clock second. The stride dwarfs any
// realistic card count, keeping note ids and card ids in disjoint bands.
let idStrideCounter = 0;
function nextIdStride(): number {
	return idStrideCounter++ * 10_000_000;
}

export function sanitizeTags(tags: string[]) {
	return tags
		.map((tag) => String(tag || '').trim().replace(/\s+/g, '-').replace(/[,\t\r\n]+/g, '-'))
		.filter(Boolean)
		.join(' ');
}

export function stripHtml(html: string) {
	return String(html || '')
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();
}

/** Checksum del campo de orden EXACTAMENTE como Anki: primeros 8 hex de SHA-1
 *  sobre el texto plano. Un hash casero rompe la búsqueda de duplicados por
 *  campo dentro de Anki. */
export async function ankiFieldChecksum(sfld: string): Promise<number> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(sfld));
	const hex = Array.from(new Uint8Array(digest))
		.slice(0, 4)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	return parseInt(hex, 16);
}

export function buildModelEntry(model: ApkgModelSpec) {
	return {
		id: model.id,
		name: model.name,
		type: 0,
		mod: Math.floor(Date.now() / 1000),
		usn: 0,
		sortf: model.sortf ?? 0,
		did: null,
		tmpls: model.templates.map((template, ord) => ({
			name: template.name,
			ord,
			qfmt: template.qfmt,
			afmt: template.afmt,
			bqfmt: '',
			bafmt: '',
			did: null,
			sticky: false,
		})),
		// Un solo template por note type: cada tarjeta requiere el campo 0.
		req: model.templates.map((_, ord) => [ord, 'any', [model.sortf ?? 0]]),
		flds: model.fields.map((fieldName, ord) => ({
			name: fieldName,
			ord,
			sticky: false,
			rtl: false,
			font: 'Arial',
			size: 20,
			media: [],
			strip: false,
		})),
		css: model.css,
		latexPre: '',
		latexPost: '',
		latexsvg: false,
		vers: [],
		tags: [],
	};
}

export function buildDeckJson(decks: ApkgDeckSpec[]) {
	const nowSec = Math.floor(Date.now() / 1000);
	const entries = decks.map((deck) => [
		String(stableNumericId(deck.name, 1_700_000_000_000)),
		{
			id: stableNumericId(deck.name, 1_700_000_000_000),
			name: deck.name,
			mod: nowSec,
			usn: 0,
			collapsed: false,
			browserCollapsed: false,
			desc: deck.desc || '',
			conf: deck.conf,
			newToday: [0, 0],
			revToday: [0, 0],
			lrnToday: [0, 0],
			timeToday: [0, 0],
			extendNew: 0,
			extendRev: 0,
			extendLrn: 0,
			dyn: 0,
			collapsedTime: 0,
		},
	]);
	return JSON.stringify(Object.fromEntries(entries));
}

export function buildDeckConfigJson(dconfs: ApkgConfSpec[]) {
	const nowSec = Math.floor(Date.now() / 1000);
	const entries = dconfs.map((preset) => [
		String(preset.id),
		{ id: preset.id, name: preset.name, mod: nowSec, usn: 0, ...preset.config },
	]);
	return JSON.stringify(Object.fromEntries(entries));
}

function createCollectionSchema(db: any, spec: ApkgSpec) {
	db.run(`
    CREATE TABLE col (
      id integer primary key,
      crt integer not null,
      mod integer not null,
      scm integer not null,
      ver integer not null,
      dty integer not null,
      usn integer not null,
      ls integer not null,
      conf text not null,
      models text not null,
      decks text not null,
      dconf text not null,
      tags text not null
    );

    CREATE TABLE notes (
      id integer primary key,
      guid text not null,
      mid integer not null,
      mod integer not null,
      usn integer not null,
      tags text not null,
      flds text not null,
      sfld text not null,
      csum integer not null,
      flags integer not null,
      data text not null
    );

    CREATE TABLE cards (
      id integer primary key,
      nid integer not null,
      did integer not null,
      ord integer not null,
      mod integer not null,
      usn integer not null,
      type integer not null,
      queue integer not null,
      due integer not null,
      ivl integer not null,
      factor integer not null,
      reps integer not null,
      lapses integer not null,
      left integer not null,
      odue integer not null,
      odid integer not null,
      flags integer not null,
      data text not null
    );

    CREATE TABLE revlog (
      id integer primary key,
      cid integer not null,
      usn integer not null,
      ease integer not null,
      ivl integer not null,
      lastIvl integer not null,
      factor integer not null,
      time integer not null,
      type integer not null
    );

    CREATE TABLE graves (
      usn integer not null,
      oid integer not null,
      type integer not null
    );
  `);

	const now = Date.now();
	db.run(`INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
		1,
		Math.floor(now / 1000),
		Math.floor(now / 1000),
		Math.floor(now / 1000),
		11,
		0,
		0,
		0,
		JSON.stringify({}),
		JSON.stringify(Object.fromEntries(spec.models.map((model) => [String(model.id), buildModelEntry(model)]))),
		buildDeckJson(spec.decks),
		buildDeckConfigJson(spec.dconfs),
		JSON.stringify({}),
	]);
}

/**
 * Construye el buffer SQLite de collection.anki2 a partir de la spec.
 * `SQL` es el constructor de sql.js (inyectado: wasm del bundle en la
 * extensión, npm sql.js en QA).
 */
export async function buildCollectionBuffer(
	spec: ApkgSpec,
	SQL: any,
	onProgress?: (msg: string) => void
): Promise<Uint8Array> {
	if (spec.notes.length === 0) {
		throw new Error('No hay tarjetas para exportar.');
	}
	const modelByName = new Map(spec.models.map((model) => [model.name, model]));
	const deckIdByName = new Map(spec.decks.map((deck) => [deck.name, stableNumericId(deck.name, 1_700_000_000_000)]));

	const nowSec = Math.floor(Date.now() / 1000);
	// Monotonic note-id base: two exports in the same second must not reuse ids,
	// or Anki merges the new notes into the previous ones. Each call advances the
	// base by a stride larger than any realistic card count.
	const idBase = nowSec * 1000 + nextIdStride();

	const db = new SQL.Database();
	createCollectionSchema(db, spec);

	for (let index = 0; index < spec.notes.length; index += 1) {
		const note = spec.notes[index];
		const model = modelByName.get(note.modelName);
		if (!model) throw new Error(`Note type desconocido: ${note.modelName}`);
		const deckId = deckIdByName.get(note.deck);
		if (!deckId) throw new Error(`Mazo no declarado en el paquete: ${note.deck}`);

		const noteId = idBase + index;
		const cardId = idBase + index + 1_000_000;
		const tags = Array.isArray(note.tags) ? sanitizeTags(note.tags) : '';
		const fields = fieldsJoin(note.fields);
		const sortf = model.sortf ?? 0;
		const sfld = stripHtml(note.fields[sortf] ?? '');
		const csum = await ankiFieldChecksum(sfld);

		if (index % 25 === 0) onProgress?.(`Insertando tarjetas ${index + 1}/${spec.notes.length}...`);

		db.run(`INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
			noteId,
			// GUID por contenido: re-importar la misma lección/palabra ACTUALIZA
			// las notas en vez de duplicarlas, aunque cambie el orden o la
			// cantidad entre exportaciones.
			note.guid?.trim() || stableGuid(`${note.deck}|${fields}`),
			model.id,
			nowSec,
			0,
			tags,
			fields,
			sfld,
			csum,
			0,
			'',
		]);

		db.run(`INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
			cardId,
			noteId,
			deckId,
			0,
			nowSec,
			0,
			0,
			0,
			index, // due: conserva el orden del autor dentro del mazo
			0,
			2500,
			0,
			0,
			0,
			0,
			0,
			0,
			'',
		]);
	}

	const sqliteData = db.export();
	db.close();
	return sqliteData;
}
