import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import initSqlJs from "sql.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "artifacts", "anki-export-test");
const studyAgentPath = path.join(repoRoot, "src", "app", "components", "StudyAgentTab.tsx");
const wasmPath = path.join(repoRoot, "node_modules", "sql.js", "dist", "sql-wasm.wasm");

const CARD_META = {
  concepto: { label: "Concepto", icon: "🎯", accent: "#a78bfa" },
  aplicacion: { label: "Aplicación", icon: "🧩", accent: "#34d399" },
  codigo: { label: "Código", icon: "💻", accent: "#86efac" },
  entrevista: { label: "Entrevista", icon: "💼", accent: "#93c5fd" },
  comparacion: { label: "Comparación", icon: "🔄", accent: "#fcd34d" },
  proceso: { label: "Proceso", icon: "📋", accent: "#e879f9" },
};

const courseName = "Java In-Depth: Become a Complete Java Engineer! [2026]";
const lessonName = "8. Platform Dependency + Demo";
const ankiNoteType = "Subtitle Bridge Basic";
const safeLesson = lessonName.replace(/[^a-z0-9]/gi, "_");
const safePackage = `${safeName(courseName)}__${safeName(lessonName)}`;

const cards = [
  {
    id: "platform-dependency",
    type: "concepto",
    front: "¿Qué significa que un programa sea dependiente de la plataforma?",
    back: `<div class="concept-box">Un ejecutable dependiente de la plataforma queda ligado al sistema operativo y/o arquitectura para los que fue compilado.</div><p>Para ejecutarlo en otra plataforma normalmente hay que <strong>recompilarlo</strong> o usar una capa de compatibilidad.</p>`,
    tags: ["Java", "platform-dependency", "portabilidad"],
  },
  {
    id: "windows-linux-executable",
    type: "comparacion",
    front: "¿Por qué un ejecutable de Windows no corre directamente en Linux?",
    back: `<table><thead><tr><th>Factor</th><th>Windows</th><th>Linux</th></tr></thead><tbody><tr><td>Formato</td><td>PE / .exe</td><td>ELF</td></tr><tr><td>Sistema</td><td>APIs y llamadas de Windows</td><td>Syscalls del kernel Linux</td></tr></tbody></table><p>El binario espera servicios del sistema operativo para el que fue compilado.</p>`,
    tags: ["Java", "C", "Windows", "Linux"],
  },
  {
    id: "compile-link-flow",
    type: "proceso",
    front: "Resume el flujo típico de un programa C hasta convertirse en ejecutable.",
    back: "<ol><li>Código fuente</li><li>Compilación</li><li>Código objeto</li><li>Enlazado con librerías/runtime</li><li>Ejecutable nativo para una plataforma concreta</li></ol>",
    tags: ["C", "compilacion", "linking"],
  },
  {
    id: "java-contrast",
    type: "entrevista",
    front: "En una entrevista, ¿cómo conectarías esta demo con el principio Write Once, Run Anywhere de Java?",
    back: `<div class="interview-box"><div class="label">Estructura oral</div><p>Primero explicaría el problema: en C, un binario nativo depende de la plataforma. Luego conectaría Java: compila a bytecode y lo ejecuta una JVM específica para cada sistema.</p></div><details><summary>Frase de cierre</summary>Por eso el mismo archivo .class puede correr en varias plataformas con JVM compatible.</details>`,
    tags: ["Java", "entrevista", "WORA", "JVM"],
  },
  {
    id: "hello-c-demo",
    type: "codigo",
    front: "¿Qué observarías si copias un `hello.exe` compilado en Windows a una máquina Linux e intentas ejecutarlo?",
    back: `<p>Lo esperable es que Linux no lo ejecute como binario nativo.</p><pre><code>./hello.exe</code></pre><div class="warning-box">Puede fallar por formato incompatible o requerir herramientas de compatibilidad como Wine.</div><p>La solución portable en C sería recompilar desde el código fuente para Linux.</p>`,
    tags: ["C", "demo", "ejecutable"],
  },
  {
    id: "practical-lesson",
    type: "aplicacion",
    front: "¿Qué decisión práctica tomarías si debes distribuir una herramienta a usuarios en Windows, macOS y Linux?",
    back: `<ul><li>Publicar binarios separados por plataforma.</li><li>Automatizar builds por sistema.</li><li>Usar un runtime portable.</li><li>Diseñar sobre una plataforma que abstraiga diferencias, como Java con JVM.</li></ul><div class="tip-box">La mejor decisión depende del producto, usuarios objetivo y costo de mantenimiento.</div>`,
    tags: ["arquitectura", "distribucion", "portabilidad"],
  },
];

function extractTemplateLiteral(source, name) {
  const marker = `const ${name} = \``;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`No se encontró ${name}`);
  let index = start + marker.length;
  let value = "";
  while (index < source.length) {
    const char = source[index];
    if (char === "`" && source[index - 1] !== "\\") return value;
    value += char;
    index += 1;
  }
  throw new Error(`No se pudo cerrar el template literal de ${name}`);
}

function toPrism(html, lang = "java") {
  return html
    .replace(/<pre[^>]*>\s*<code[^>]*>/gi, "%%USB_PRE_CODE%%")
    .replace(/<\/code>\s*<\/pre>/gi, "%%USB_END_PRE_CODE%%")
    .replace(/<pre[^>]*>/gi, "%%USB_PRE_CODE%%")
    .replace(/<\/pre>/gi, "%%USB_END_PRE_CODE%%")
    .replace(/%%USB_PRE_CODE%%/g, `<pre class="language-${lang}" data-lang="${lang.toUpperCase()}"><code class="language-${lang}">`)
    .replace(/%%USB_END_PRE_CODE%%/g, "</code></pre>");
}

function buildCardFront(card) {
  const meta = CARD_META[card.type];
  const accent = meta.accent;
  return `<div class="header-bar"><div class="header-dot red"></div><div class="header-dot yellow"></div><div class="header-dot green"></div><div class="type-pill" style="background:${accent}18;color:${accent};border:1px solid ${accent}38">${meta.icon} ${meta.label}</div></div><div id="qa">${toPrism(card.front)}</div>`;
}

function buildCardBack(card) {
  return `<div class="answer">${toPrism(card.back)}</div>`;
}

function normalizeAnkiTag(tag) {
  return String(tag || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[,\t\r\n]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toAnkiImportField(html) {
  return String(html || "").replace(/\t/g, "  ").replace(/\r?\n/g, "<br>");
}

function buildAnkiTxt(frontBackCards) {
  let out = [
    "#separator:Tab",
    "#html:true",
    `#deck:${courseName}::${lessonName}`,
    `#notetype:${ankiNoteType}`,
    "#columns:Front\tBack\tTags",
    "#tags column:3",
    "",
    "",
  ].join("\n");
  frontBackCards.forEach((card) => {
    const tags = card.tags.map(normalizeAnkiTag).filter(Boolean).join(" ");
    out += `${toAnkiImportField(buildCardFront(card))}\t${toAnkiImportField(buildCardBack(card))}\t${tags}\n`;
  });
  return out;
}

function buildTemplateGuide(frontTemplate, backTemplate) {
  return `SUBTITLE BRIDGE - PLANTILLA ANKI
Setup unico para importacion TXT manual
Curso: ${courseName}

Ruta recomendada: importa el archivo .apkg desde Anki Desktop. Incluye mazo, diseno y tarjetas.
Ruta manual TXT: usa estos 3 archivos solo si quieres importar texto con el tipo "${ankiNoteType}".

ARCHIVO 1 - ${safeLesson}_tarjetas.txt - Tarjetas
  1. En Anki: Archivo -> Importar
  2. Selecciona el archivo "_tarjetas.txt"
  3. Verifica: Separador = Tabulador | HTML = activado
  4. Verifica columnas: Front, Back, Tags
  5. Deck destino = ${courseName}::${lessonName}
  6. Clic en "Importar"

ARCHIVO 2 - anki-card-styles.css - Estilo visual
  1. Abre "anki-card-styles.css" con cualquier editor de texto
  2. Selecciona todo (Ctrl+A) y copialo
  3. En Anki: Herramientas -> Tipos de notas -> ${ankiNoteType} -> Tarjetas/Cards -> Styling
  4. Selecciona todo el texto del editor (Ctrl+A) y pega el CSS
  5. Clic en "Guardar"
  Sin este paso las tarjetas se veran sin el diseno visual.

ARCHIVO 3 - PLANTILLA-ANKI.txt - Plantillas
  1. Si no existe, crea un tipo nuevo clonando "Basic" y llamalo "${ankiNoteType}".
  2. En Anki: Herramientas -> Tipos de notas -> ${ankiNoteType} -> Tarjetas
  3. Pestana "Plantilla del anverso (Front)":
     selecciona todo -> pega el bloque FRONT al final de este archivo.
  4. Pestana "Plantilla del reverso (Back)":
     selecciona todo -> pega el bloque BACK al final de este archivo.
  5. Clic en "Guardar"
  Sin este paso el resaltado de codigo (Prism.js) no funcionara.

Listo. Las exportaciones TXT futuras de este curso solo necesitan el archivo de tarjetas.
Si borras el estilo o la plantilla en Anki, puedes volver a descargar CSS + plantilla desde la extension.

PLANTILLA FRONT - copiar todo hasta "FIN FRONT"

${frontTemplate}

FIN FRONT

PLANTILLA BACK - copiar todo hasta "FIN BACK"

${backTemplate}

FIN BACK
`;
}

function fieldsJoin(front, back) {
  return `${front.replace(/\x1f/g, " ")}\x1f${back.replace(/\x1f/g, " ")}`;
}

function stableGuid(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `usb${hash.toString(36)}`;
}

function stableNumericId(input, offset) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return offset + hash;
}

function stableAnkiGuid(course, lesson, card, index) {
  return stableGuid(`${course}|${lesson}|${card.id || index}|${card.front}`);
}

function checksumField(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function sanitizeTags(tags) {
  return tags.map(normalizeAnkiTag).filter(Boolean).join(" ");
}

function buildDeckJson(deckId, deckName) {
  return JSON.stringify({
    [String(deckId)]: {
      id: deckId,
      name: deckName,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      collapsed: false,
      browserCollapsed: false,
      desc: "",
      conf: 1,
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
  });
}

function buildModelJson(modelId, modelCss, frontTemplate, backTemplate) {
  return JSON.stringify({
    [String(modelId)]: {
      id: modelId,
      name: "Subtitle Bridge Basic",
      type: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: 0,
      sortf: 0,
      did: null,
      tmpls: [{ name: "Card 1", ord: 0, qfmt: frontTemplate, afmt: backTemplate, bqfmt: "", bafmt: "", did: null, sticky: false, req: [[0, "any", [0]]] }],
      flds: [
        { name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20, media: [], strip: false },
        { name: "Back", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20, media: [], strip: false },
      ],
      css: modelCss,
      latexPre: "",
      latexPost: "",
      latexsvg: false,
      vers: [],
      tags: [],
    },
  });
}

function buildDeckConfigJson() {
  return JSON.stringify({
    1: {
      id: 1,
      name: "Default",
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
        perDay: 20,
      },
      rev: {
        bury: true,
        ease4: 1.3,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        perDay: 200,
      },
      lapse: {
        delays: [10],
        leechAction: 0,
        leechFails: 8,
        minInt: 1,
        mult: 0,
      },
      dyn: false,
      newMix: 0,
      newPerDayMinimum: 0,
      interdayLearningMix: 0,
      reviewOrder: 0,
    },
  });
}

function createCollectionSchema(db, deckId, deckName, modelId, modelCss, frontTemplate, backTemplate) {
  db.run(`
    CREATE TABLE col (
      id integer primary key, crt integer not null, mod integer not null, scm integer not null,
      ver integer not null, dty integer not null, usn integer not null, ls integer not null,
      conf text not null, models text not null, decks text not null, dconf text not null, tags text not null
    );
    CREATE TABLE notes (
      id integer primary key, guid text not null, mid integer not null, mod integer not null,
      usn integer not null, tags text not null, flds text not null, sfld integer not null,
      csum integer not null, flags integer not null, data text not null
    );
    CREATE TABLE cards (
      id integer primary key, nid integer not null, did integer not null, ord integer not null,
      mod integer not null, usn integer not null, type integer not null, queue integer not null,
      due integer not null, ivl integer not null, factor integer not null, reps integer not null,
      lapses integer not null, left integer not null, odue integer not null, odid integer not null,
      flags integer not null, data text not null
    );
    CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
    CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
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
    buildModelJson(modelId, modelCss, frontTemplate, backTemplate),
    buildDeckJson(deckId, deckName),
    buildDeckConfigJson(),
    JSON.stringify({}),
  ]);
}

async function buildAnkiApkg(apkgCards, deckName, modelCss, frontTemplate, backTemplate) {
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database();
  const deckId = stableNumericId(deckName, 1_700_000_000_000);
  const modelId = stableNumericId("Subtitle Bridge Basic", 1_800_000_000_000);
  const nowSec = Math.floor(Date.now() / 1000);
  createCollectionSchema(db, deckId, deckName, modelId, modelCss, frontTemplate, backTemplate);

  apkgCards.forEach((card, index) => {
    const noteId = nowSec * 1000 + index;
    const cardId = nowSec * 1000 + index + 100000;
    const front = String(card.front || "");
    const back = String(card.back || "");
    const fields = fieldsJoin(front, back);
    const sfld = front.replace(/<[^>]+>/g, "").trim();
    db.run(`INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      noteId,
      card.guid || stableGuid(`${deckName}|${front}|${index}`),
      modelId,
      Math.floor(Date.now() / 1000),
      0,
      sanitizeTags(card.tags || []),
      fields,
      sfld,
      checksumField(sfld),
      0,
      "",
    ]);
    db.run(`INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      cardId,
      noteId,
      deckId,
      0,
      Math.floor(Date.now() / 1000),
      0,
      0,
      0,
      apkgCards.length - index,
      0,
      2500,
      0,
      0,
      0,
      0,
      0,
      0,
      "",
    ]);
  });

  const sqliteData = db.export();
  db.close();
  const zip = new JSZip();
  zip.file("collection.anki2", sqliteData, { compression: "DEFLATE", compressionOptions: { level: 6 } });
  zip.file("media", "{}", { compression: "DEFLATE", compressionOptions: { level: 6 } });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function safeName(input) {
  return input.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

async function main() {
  const source = fs.readFileSync(studyAgentPath, "utf8");
  const frontTemplate = extractTemplateLiteral(source, "FRONT_TEMPLATE");
  const backTemplate = extractTemplateLiteral(source, "BACK_TEMPLATE");
  const css = extractTemplateLiteral(source, "ANKI_CSS");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${safeLesson}_tarjetas.txt`), buildAnkiTxt(cards), "utf8");
  fs.writeFileSync(path.join(outDir, "anki-card-styles.css"), css, "utf8");
  fs.writeFileSync(path.join(outDir, "PLANTILLA-ANKI.txt"), buildTemplateGuide(frontTemplate, backTemplate), "utf8");

  const apkgCards = cards.map((card, index) => ({
    front: buildCardFront(card),
    back: buildCardBack(card),
    tags: card.tags.map(normalizeAnkiTag).filter(Boolean),
    guid: stableAnkiGuid(courseName, lessonName, card, index),
  }));
  const apkg = await buildAnkiApkg(apkgCards, `${courseName}::${lessonName}`, css, frontTemplate, backTemplate);
  fs.writeFileSync(path.join(outDir, `${safePackage}.apkg`), Buffer.from(apkg));

  const readme = `Prueba Anki - Udemy Subtitle Bridge

Archivos generados:
- ${safePackage}.apkg
- ${safeLesson}_tarjetas.txt
- anki-card-styles.css
- PLANTILLA-ANKI.txt

Camino recomendado:
1. Abre Anki Desktop.
2. Usa Archivo -> Importar y selecciona ${safePackage}.apkg. Si Windows lo tiene asociado a Anki, tambien puedes probar doble clic.
3. Acepta la importacion.
4. Debes ver el mazo: ${courseName}::${lessonName}
5. Deben entrar ${cards.length} tarjetas con el diseno oscuro de Subtitle Bridge.
6. Si reimportas la misma leccion, el paquete usa IDs estables; revisa el resumen de Anki antes de confirmar para ver si actualiza u omite notas existentes.

Camino TXT manual:
1. En Anki: Tools/Herramientas -> Manage Note Types/Tipos de notas.
2. Pulsa Add/Añadir, elige clonar Basic si Anki lo pregunta, y nómbralo "${ankiNoteType}".
3. Selecciona "${ankiNoteType}" y pulsa Cards.
4. En Styling, pega el contenido de anki-card-styles.css.
5. En Front Template y Back Template, pega FRONT y BACK desde PLANTILLA-ANKI.txt.
6. Luego Archivo -> Importar -> ${safeLesson}_tarjetas.txt.
7. Verifica: Note Type = ${ankiNoteType}, separador Tab, HTML activado, columnas Front / Back / Tags.
8. Importa al mazo ${courseName}::${lessonName}.

Resultado esperado:
- ${cards.length} notas / ${cards.length} tarjetas.
- Etiquetas: Concepto, Comparacion, Proceso, Entrevista, Codigo y Aplicacion en el pill superior.
- Al voltear, aparece la respuesta con el mismo estilo visual configurado en la extension.
- El tema claro/oscuro sigue la configuracion del sistema operativo; si Anki esta en modo noche, fuerza oscuro.
- Las tarjetas de prueba incluyen tabla, lista, codigo, details y cajas semanticas para validar el CSS rico.
`;
  fs.writeFileSync(path.join(outDir, "README_IMPORTAR.txt"), readme, "utf8");

  console.log(`Generados ${cards.length} cards en ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
