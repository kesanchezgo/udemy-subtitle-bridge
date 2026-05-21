// ─── Anki .apkg Generator ─────────────────────────────────────────────────────
// Builds a real .apkg file (ZIP + SQLite) importable directly into Anki
// by double-clicking — no manual import wizard required.
//
// Format: .apkg = ZIP with:
//   collection.anki2  — SQLite database (Anki 2.0 schema, ver=11)
//   media             — JSON media map (empty {} if no images)

import initSqlJs from "sql.js";
import JSZip from "jszip";
// Import the WASM binary as a URL directly from the installed package.
// This guarantees the WASM version always matches the JS runtime — no CDN needed.
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

export interface AnkiCardData {
  front: string;
  back:  string;
  tags:  string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** djb2-variant checksum — Anki uses SHA1 but any stable 32-bit int works */
function fieldCsum(str: string): number {
  let h = 5381;
  const plain = str.replace(/<[^>]+>/g, "").trim(); // strip HTML for csum
  for (let i = 0; i < plain.length; i++) {
    h = (((h << 5) + h) + plain.charCodeAt(i)) | 0;
  }
  return (h >>> 0) % 0xFFFFFFFF;
}

function randomGuid(len = 10): string {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function buildAnkiApkg(
  cards:         AnkiCardData[],
  deckName:      string,
  modelCss:      string,
  frontTemplate: string,
  backTemplate:  string,
  onProgress?:   (msg: string) => void,
): Promise<Uint8Array> {

  onProgress?.("Cargando motor SQLite (WASM)…");
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl,
  });

  onProgress?.("Creando base de datos Anki…");
  const db = new SQL.Database();

  // ── Schema ─────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE col (
      id      INTEGER PRIMARY KEY,
      crt     INTEGER NOT NULL,
      mod     INTEGER NOT NULL,
      scm     INTEGER NOT NULL,
      ver     INTEGER NOT NULL,
      dty     INTEGER NOT NULL,
      usn     INTEGER NOT NULL,
      ls      INTEGER NOT NULL,
      conf    TEXT NOT NULL,
      models  TEXT NOT NULL,
      decks   TEXT NOT NULL,
      dconf   TEXT NOT NULL,
      tags    TEXT NOT NULL
    );
    CREATE TABLE notes (
      id      INTEGER PRIMARY KEY,
      guid    TEXT    NOT NULL,
      mid     INTEGER NOT NULL,
      mod     INTEGER NOT NULL,
      usn     INTEGER NOT NULL,
      tags    TEXT    NOT NULL,
      flds    TEXT    NOT NULL,
      sfld    INTEGER NOT NULL,
      csum    INTEGER NOT NULL,
      flags   INTEGER NOT NULL,
      data    TEXT    NOT NULL
    );
    CREATE TABLE cards (
      id      INTEGER PRIMARY KEY,
      nid     INTEGER NOT NULL,
      did     INTEGER NOT NULL,
      ord     INTEGER NOT NULL,
      mod     INTEGER NOT NULL,
      usn     INTEGER NOT NULL,
      type    INTEGER NOT NULL,
      queue   INTEGER NOT NULL,
      due     INTEGER NOT NULL,
      ivl     INTEGER NOT NULL,
      factor  INTEGER NOT NULL,
      reps    INTEGER NOT NULL,
      lapses  INTEGER NOT NULL,
      left    INTEGER NOT NULL,
      odue    INTEGER NOT NULL,
      odid    INTEGER NOT NULL,
      flags   INTEGER NOT NULL,
      data    TEXT    NOT NULL
    );
    CREATE TABLE revlog (
      id      INTEGER PRIMARY KEY,
      cid     INTEGER NOT NULL,
      usn     INTEGER NOT NULL,
      ease    INTEGER NOT NULL,
      ivl     INTEGER NOT NULL,
      lastIvl INTEGER NOT NULL,
      factor  INTEGER NOT NULL,
      time    INTEGER NOT NULL,
      type    INTEGER NOT NULL
    );
    CREATE TABLE graves (
      usn  INTEGER NOT NULL,
      oid  INTEGER NOT NULL,
      type INTEGER NOT NULL
    );
    CREATE INDEX ix_notes_usn  ON notes (usn);
    CREATE INDEX ix_notes_csum ON notes (csum);
    CREATE INDEX ix_cards_usn  ON cards (usn);
    CREATE INDEX ix_cards_nid  ON cards (nid);
    CREATE INDEX ix_cards_sched ON cards (did, queue, due);
    CREATE INDEX ix_revlog_usn ON revlog (usn);
    CREATE INDEX ix_revlog_cid ON revlog (cid);
  `);

  // ── IDs & timestamps ───────────────────────────────────────────────────────
  const nowSec = Math.floor(Date.now() / 1000);
  const deckId  = Date.now();           // ms-precision, safe as int64
  const modelId = Date.now() + 1;

  // ── Model definition ───────────────────────────────────────────────────────
  const model = {
    id:    String(modelId),
    name:  "SubtitleBridge",
    type:  0,
    mod:   nowSec,
    usn:   0,
    sortf: 0,
    did:   deckId,
    tmpls: [{
      name:  "Card 1",
      ord:   0,
      qfmt:  frontTemplate,
      afmt:  backTemplate,
      bqfmt: "",
      bafmt: "",
      did:   null,
      bfont: "Arial",
      bsize: 12,
    }],
    flds: [
      { name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
      { name: "Back",  ord: 1, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
    ],
    css: modelCss,
    latexPre:  "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}",
    req:  [[0, "any", [0]]],
  };

  // ── Deck definition ────────────────────────────────────────────────────────
  const deck = {
    id:               deckId,
    name:             deckName,
    conf:             1,
    extendRev:        50,
    usn:              0,
    graveTime:        0,
    newToday:         [0, 0],
    revToday:         [0, 0],
    lrnToday:         [0, 0],
    timeToday:        [0, 0],
    collapsed:        false,
    browserCollapsed: false,
    desc:             "Generado por Subtitle Bridge · AI local",
    dyn:              0,
    mod:              nowSec,
  };

  // ── Deck config ────────────────────────────────────────────────────────────
  const dconf = {
    "1": {
      id:       1,
      name:     "Default",
      replayq:  true,
      lapse:    { leechFails: 8, minInt: 1, delays: [10], leechAction: 0, mult: 0 },
      rev:      { perDay: 200, ease4: 1.3, fuzz: 0.05, minSpace: 1, ivlFct: 1, maxIvl: 36500, bury: false, hardFactor: 1.2 },
      timer:    0,
      maxTaken: 60,
      usn:      0,
      new:      { perDay: 20, delays: [1, 10], separate: true, ints: [1, 4, 7], initialFactor: 2500, bury: false, order: 1 },
      mod:      nowSec,
      autoplay: true,
    },
  };

  // ── Collection config ──────────────────────────────────────────────────────
  const conf = {
    nextPos:      1,
    estTimes:     true,
    activeDecks:  [deckId],
    sortType:     "noteFld",
    timeLim:      0,
    sortBackwards: false,
    addToCur:     true,
    curDeck:      deckId,
    newBury:      true,
    newSpread:    0,
    dueCounts:    true,
    curModel:     String(modelId),
    collapseTime: 1200,
  };

  // ── Insert col ─────────────────────────────────────────────────────────────
  const colStmt = db.prepare(
    "INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, -1, 0, ?, ?, ?, ?, '{}')"
  );
  colStmt.run([
    nowSec,
    nowSec,
    nowSec * 1000,
    JSON.stringify(conf),
    JSON.stringify({ [String(modelId)]: model }),
    JSON.stringify({ [String(deckId)]:  deck  }),
    JSON.stringify(dconf),
  ]);
  colStmt.free();

  // ── Insert notes & cards ───────────────────────────────────────────────────
  onProgress?.(`Insertando ${cards.length} tarjetas…`);

  const noteStmt = db.prepare(
    'INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, 0, ?, 0, "")'
  );
  const cardStmt = db.prepare(
    'INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, "")'
  );

  cards.forEach((card, i) => {
    const noteId = nowSec * 1000 + i;
    const cardId = nowSec * 1000 + i + 100_000;
    const front  = card.front.replace(/\t/g, "  ");
    const back   = card.back.replace(/\t/g, "  ");
    const flds   = front + "\x1f" + back;       // Anki field separator = ASCII 31
    const csum   = fieldCsum(front);
    const tags   = card.tags.join(" ");

    noteStmt.run([noteId, randomGuid(), modelId, nowSec, tags, flds, csum]);
    cardStmt.run([cardId, noteId, deckId, nowSec, cards.length - i]);
  });

  noteStmt.free();
  cardStmt.free();

  // ── Export binary SQLite ───────────────────────────────────────────────────
  onProgress?.("Generando binario SQLite…");
  const dbData = db.export();
  db.close();

  // ── Build .apkg ZIP ────────────────────────────────────────────────────────
  onProgress?.("Comprimiendo .apkg…");
  const zip = new JSZip();
  zip.file("collection.anki2", dbData);
  zip.file("media", "{}");                      // no media files in this export

  const apkg = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  onProgress?.("¡Listo!");
  return apkg;
}

/** Trigger browser download of the generated .apkg file */
export function downloadApkg(data: Uint8Array, filename: string): void {
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}