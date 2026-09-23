import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export interface AnkiCardData {
  front: string;
  back: string;
  tags: string[];
  guid?: string;
}

function fieldsJoin(front: string, back: string) {
  return `${front.replace(/\x1f/g, ' ')}\x1f${back.replace(/\x1f/g, ' ')}`;
}

function stableGuid(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `usb${hash.toString(36)}`;
}

function stableNumericId(input: string, offset: number) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return offset + hash;
}

// Advances on every apkg build so ids never repeat within a session, even when
// two exports happen in the same wall-clock second. The stride dwarfs any
// realistic card count, keeping note ids and card ids in disjoint bands.
let idStrideCounter = 0;
function nextIdStride(): number {
  return idStrideCounter++ * 10_000_000;
}

function sanitizeTags(tags: string[]) {
  return tags
    .map((tag) => String(tag || '').trim().replace(/\s+/g, '-').replace(/[,\t\r\n]+/g, '-'))
    .filter(Boolean)
    .join(' ');
}

function buildDeckJson(deckId: number, deckName: string) {
  return JSON.stringify({
    [String(deckId)]: {
      id: deckId,
      name: deckName,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      collapsed: false,
      browserCollapsed: false,
      desc: '',
      conf: 1,
      newToday: [0, 0],
      revToday: [0, 0],
      lrnToday: [0, 0],
      timeToday: [0, 0],
      extendNew: 0,
      extendRev: 0,
      extendLrn: 0,
      dyn: 0,
      collapsedTime: 0
    }
  });
}

function buildModelJson(modelId: number, modelCss: string, frontTemplate: string, backTemplate: string) {
  return JSON.stringify({
    [String(modelId)]: {
      id: modelId,
      name: 'Subtitle Bridge Basic',
      type: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      sortf: 0,
      did: null,
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: frontTemplate,
          afmt: backTemplate,
          bqfmt: '',
          bafmt: '',
          did: null,
          sticky: false
        }
      ],
      req: [[0, 'any', [0]]],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [], strip: false },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [], strip: false }
      ],
      css: modelCss,
      latexPre: '',
      latexPost: '',
      latexsvg: false,
      vers: [],
      tags: []
    }
  });
}

function buildDeckConfigJson() {
  return JSON.stringify({
    1: {
      id: 1,
      name: 'Default',
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: {
        bury: true,
        delays: [1, 10],
        initialFactor: 2500,
        ints: [1, 4, 0],
        order: 1,
        perDay: 20
      },
      rev: {
        bury: true,
        ease4: 1.3,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        perDay: 200
      },
      lapse: {
        delays: [10],
        leechAction: 0,
        leechFails: 8,
        minInt: 1,
        mult: 0
      },
      dyn: false,
      newMix: 0,
      newPerDayMinimum: 0,
      interdayLearningMix: 0,
      reviewOrder: 0
    }
  });
}

function createCollectionSchema(db: any, deckId: number, deckName: string, modelId: number, modelCss: string, frontTemplate: string, backTemplate: string) {
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
  db.run(
    `INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      1,
      Math.floor(now / 1000),
      Math.floor(now / 1000),
      Math.floor(now / 1000),
      11,
      0,
      0,
      0,
      JSON.stringify({}),
      buildModelJson(modelId, modelCss, frontTemplate, backTemplate),
      buildDeckJson(deckId, deckName),
      buildDeckConfigJson(),
      JSON.stringify({})
    ]
  );
}

function checksumField(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Resuelve la URL del wasm contra el bundle de la extensión.
 *
 * El import `?url` emite una ruta RELATIVA ("assets/sql-wasm-*.wasm") que, al
 * hacer fetch desde un content script, se resuelve contra el ORIGEN DE LA
 * PÁGINA (https://www.udemy.com/assets/...) y devuelve HTML → el wasm no
 * compila ("expected magic word"). chrome.runtime.getURL la convierte en una
 * URL chrome-extension:// servida por el bundle (el recurso está declarado en
 * web_accessible_resources).
 */
function resolveSqlWasmUrl(): string {
	if (/^(https?|chrome-extension|moz-extension):/.test(sqlWasmUrl)) {
		return sqlWasmUrl;
	}
	const api = (globalThis as typeof globalThis & {
		chrome?: { runtime?: { getURL?: (path: string) => string } };
	}).chrome;
	if (typeof api?.runtime?.getURL === 'function') {
		try {
			return api.runtime.getURL(sqlWasmUrl.replace(/^\/+/, ''));
		} catch {
			/* sin runtime — devolver la cruda */
		}
	}
	return sqlWasmUrl;
}

export async function buildAnkiApkg(
	cards: AnkiCardData[],
	deckName: string,
	modelCss: string,
	frontTemplate: string,
	backTemplate: string,
	onProgress?: (msg: string) => void
): Promise<Uint8Array> {
	onProgress?.('Inicializando SQLite...');
	// Carga explícita del wasm con timeout: el locateFile interno puede quedar
	// colgado sin error si el fetch del recurso del bundle no responde, y el
	// usuario vería el export congelado sin explicación.
	const SQL = await Promise.race([
		(async () => {
			const wasmBinary = await fetch(resolveSqlWasmUrl()).then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status} al cargar sql-wasm.wasm`);
				return r.arrayBuffer();
			});
			return initSqlJs({ wasmBinary });
		})(),
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('sql.js no inicializó en 15 s — el wasm del bundle no respondió')), 15000)
		),
	]);
	const db = new SQL.Database();

  const deckId = stableNumericId(deckName, 1_700_000_000_000);
  const modelId = stableNumericId('Subtitle Bridge Basic', 1_800_000_000_000);
  const nowSec = Math.floor(Date.now() / 1000);
  // Monotonic note-id base: two exports in the same second must not reuse ids,
  // or Anki merges the new notes into the previous ones. Each call advances the
  // base by a stride larger than any realistic card count.
  const idBase = nowSec * 1000 + nextIdStride();

  createCollectionSchema(db, deckId, deckName, modelId, modelCss, frontTemplate, backTemplate);

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const noteId = idBase + index;
    const cardId = idBase + index + 1_000_000;
    const tags = Array.isArray(card.tags) ? sanitizeTags(card.tags) : '';
    const front = String(card.front || '');
    const back = String(card.back || '');
    const fields = fieldsJoin(front, back);
    const sfld = front.replace(/<[^>]+>/g, '').trim();

    onProgress?.(`Insertando tarjeta ${index + 1}/${cards.length}...`);

    db.run(
      `INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        noteId,
        // GUID por contenido (mazo+front): re-importar la misma lección
        // ACTUALIZA las notas en vez de duplicarlas, aunque el orden o la
        // cantidad de tarjetas cambie entre exportaciones.
        card.guid?.trim() || stableGuid(`${deckName}|${front}`),
        modelId,
        Math.floor(Date.now() / 1000),
        0,
        tags,
        fields,
        sfld,
        checksumField(sfld),
        0,
        ''
      ]
    );

    db.run(
      `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cardId,
        noteId,
        deckId,
        0,
        Math.floor(Date.now() / 1000),
        0,
        0,
        0,
        cards.length - index,
        0,
        2500,
        0,
        0,
        0,
        0,
        0,
        0,
        ''
      ]
    );
  }

  onProgress?.('Exportando colección...');
  const sqliteData = db.export();
  db.close();

  const zip = new JSZip();
  zip.file('collection.anki2', sqliteData, { compression: 'DEFLATE', compressionOptions: { level: 6 } });
  zip.file('media', '{}', { compression: 'DEFLATE', compressionOptions: { level: 6 } });

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadApkg(data: Uint8Array, filename: string): void {
  // Pass the Uint8Array straight to Blob. Going through Array.from() would
  // materialize a second copy of the whole archive in memory. The cast only
  // narrows the backing buffer type; no data is copied.
  const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.apkg') ? filename : `${filename}.apkg`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
