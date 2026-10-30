/**
 * Verificación REAL en Anki Desktop (vía AnkiConnect):
 *   - importa el apkg VIEJO (modelo 'Udemy Bridge Vocab') y el NUEVO
 *     (v2 por idioma) con las MISMAS palabras/GUIDs, y comprueba que Anki
 *     OMITE los duplicados (mismo GUID + distinto note type = skip);
 *   - importa un lote demo con palabras únicas para verificar el modelo v2
 *     (2 tarjetas por nota, tags kinema::*, campos nuevos, Prism en media);
 *   - renderiza Reconocer/Producir con el CSS real (claro/noche);
 *   - limpia SOLO el árbol Kinema de QA. Nada más.
 *
 * Uso: node scripts/qa-anki-old-new.mjs [--keep]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { register } from 'node:module';
register('./ts-resolve-loader.mjs', import.meta.url);
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const ANKI = 'http://127.0.0.1:8765';
const KEEP = process.argv.includes('--keep');
const ROOT_QA = 'Kinema';
const OLD_MODEL = 'Udemy Bridge Vocab';
const NEW_MODEL = 'Kinema · Vocab · English';
const SHOTS = 'tmp/anki-preview';
fs.mkdirSync(SHOTS, { recursive: true });

async function call(action, params = {}) {
	const res = await fetch(ANKI, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

let failures = 0;
const check = (n, ok, extra = '') => { if (ok) console.log(`  ✓ ${n}`); else { failures += 1; console.error(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); } };
const fieldsOf = (info) => Object.fromEntries(Object.entries(info.fields).map(([name, f]) => [name, f.value]));

// ── A. Pre-limpieza + snapshot ───────────────────────────────────────────────
console.log('══ A. Pre-limpieza + snapshot ══');
// Corridas anteriores pudieron dejar restos del árbol QA: borrarlas al inicio
// hace los deltas deterministas.
{
	const stale = await call('findNotes', { query: `deck:"${ROOT_QA}"` });
	if (stale.length) await call('deleteNotes', { notes: stale });
	await call('deleteDecks', { decks: [ROOT_QA], cardsToo: true });
}
const beforeDecks = (await call('deckNames')).sort();
const defaultConfBefore = await call('getDeckConfig', { deck: 'Default' });
const oldModelNidsBefore = await call('findNotes', { query: `note:"${OLD_MODEL}"` });
const newModelNidsBefore = await call('findNotes', { query: `note:"${NEW_MODEL}"` });
console.log(`  mazos: ${beforeDecks.length} | notas modelo viejo: ${oldModelNidsBefore.length} | modelo nuevo: ${newModelNidsBefore.length}`);
check('el preset Default del usuario existe (no se tocará)', defaultConfBefore.id === 1);

// ── B. Importar VIEJO (v1) y NUEVO (v2, mismas palabras) ────────────────────
console.log('\n══ B. Importar viejo + nuevo (mismas palabras/GUIDs) ══');
const oldApkg = path.resolve('tmp/qa-vocab-old.apkg').split('\\').join('/');
// El lote nuevo se construye replicando el builder REAL de la extensión:
// zip con collection.anki2 + media bajo nombres numéricos ("0", "1") + tabla
// media. ankiApkg.ts no se importa en Node porque sus ?raw de prismjs no
// cargan con el loader; los archivos se leen directo de node_modules/prismjs
// en el MISMO orden que el bundle de la extensión.
const NL = '\n';
const PRISM_LANGS = 'markup css clike javascript typescript jsx tsx python java kotlin csharp c cpp go php ruby bash powershell sql json yaml properties docker'.split(' ');
const PRISM_JS = PRISM_LANGS.map((l) => fs.readFileSync(`node_modules/prismjs/components/prism-${l}.min.js`, 'utf8')).join(NL);
const PRISM_CSS = fs.readFileSync('node_modules/prismjs/themes/prism.min.css', 'utf8') + NL + fs.readFileSync('node_modules/prismjs/themes/prism-tomorrow.min.css', 'utf8');
const PRISM_MEDIA = [
	{ name: '_kinema-prism-v1.js', data: PRISM_JS },
	{ name: '_kinema-prism-v1.css', data: PRISM_CSS },
];

function assembleApkg(spec, media) {
	return buildCollectionBuffer(spec, SQL).then((sqliteData) => {
		const zip = new JSZip();
		zip.file('collection.anki2', sqliteData);
		const mediaMap = {};
		media.forEach((entry, index) => {
			mediaMap[String(index)] = entry.name;
			zip.file(String(index), entry.data);
		});
		zip.file('media', JSON.stringify(mediaMap));
		return zip.generateAsync({ type: 'uint8array' });
	});
}

// Palabras del fixture de qa-anki-decks (mismos GUIDs que el lote viejo).
const { buildVocabularySpec: bvsRepo, DEFAULT_VOCAB_CONFIG: dvcRepo } = await import('../src/app/services/vocabularyService.ts');
const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');
const { createRequire: cr2 } = await import('node:module');
const req2 = cr2(import.meta.url);
const initSqlJs = req2('sql.js');
const SQL = await initSqlJs();
const repoWords = [
	{ word: 'Bottleneck', level: 'B2', pos: 'noun', meaning: 'cuello de botella; restricción', sentence: 'The slow disk is the main bottleneck in the pipeline.', sentenceTranslation: 'El disco lento es el principal cuello de botella del pipeline.', phonetic: '/ˈbɑːtəlnek/', monolingual: 'a stage that limits the speed of a whole process' },
	{ word: 'trade-off', level: 'B2', pos: 'noun', meaning: 'contrapartida; equilibrio entre ventajas', sentence: 'Every caching strategy is a trade-off between speed and freshness.', sentenceTranslation: 'Toda estrategia de caché es un equilibrio entre velocidad y frescura.', phonetic: '/ˈtreɪd ɔːf/', monolingual: 'a balance between two opposing advantages' },
	{ word: 'usbfixture', level: 'B1', pos: 'phrasal verb', meaning: 'terminar; concluir', sentence: 'Let us usbfixture this section with a quick summary.', sentenceTranslation: 'Cerremos esta sección con un resumen rápido.', phonetic: '/ˈfɪkstʃər/', monolingual: 'to finish or complete something' },
	{ word: 'latency', level: 'C1', pos: 'noun', meaning: 'latencia; retraso', sentence: 'Network latency hurts real-time applications the most.', sentenceTranslation: 'La latencia de red perjudica más a las aplicaciones en tiempo real.', phonetic: '/ləˈtɛnsi/', monolingual: 'the delay before a transfer begins' },
];
const { spec: repoSpec } = bvsRepo(repoWords, 'USB QA — Curso de Prueba', '01 — Lección de Prueba', dvcRepo);
const newApkgBuf = await assembleApkg(repoSpec, PRISM_MEDIA);
const newApkgReal = path.resolve('tmp/qa-vocab-new-real.apkg').split('\\').join('/');
fs.writeFileSync(newApkgReal, newApkgBuf);

for (const [label, file] of [['viejo (Udemy Bridge Vocab)', oldApkg], ['nuevo (Kinema · Vocab · English)', newApkgReal]]) {
	await call('importPackage', { path: file });
	console.log(`  ✓ apkg ${label} importado`);
}

const oldModelNidsAfter = (await call('findNotes', { query: `note:"${OLD_MODEL}"` })).sort();
const newModelNidsAfter = (await call('findNotes', { query: `note:"${NEW_MODEL}"` })).sort();
const addedDecks = (await call('deckNames')).filter((d) => !beforeDecks.includes(d));

// El apkg viejo trae 3 notas (las que pasan el filtro CEFR del fixture viejo).
const oldDelta = oldModelNidsAfter.length - oldModelNidsBefore.length;
check('las notas viejas importadas con su modelo v1 (Δ+3)', oldDelta === 3, `${oldModelNidsBefore.length} → ${oldModelNidsAfter.length}`);
// B7 verificado en vivo: las 3 palabras compartidas tienen el MISMO GUID
// pero distinto note type → Anki las OMITE. Solo entra 'usbfixture', que no
// estaba en el lote viejo (+1 con el modelo nuevo).
const newDelta = newModelNidsAfter.length - newModelNidsBefore.length;
check('lote nuevo: solo la palabra sin GUID previo entra (+1); las compartidas NO duplican',
	newDelta === 1, `${newModelNidsBefore.length} → ${newModelNidsAfter.length} (Δ${newDelta})`);
const sharedGuids = ['usb5j81ld', 'usb1mk580k', 'usbmne1g0'];
const newGuids = newModelNidsAfter.length ? (await call('notesInfo', { notes: newModelNidsAfter })).map((n) => n.guid) : [];
check('ninguna nota nueva usa los GUIDs compartidos con el lote viejo',
	!sharedGuids.some((g) => newGuids.includes(g)), JSON.stringify(newGuids));
check('solo se añadieron mazos bajo la raíz Kinema', addedDecks.every((d) => d === ROOT_QA || d.startsWith(`${ROOT_QA}::`)), JSON.stringify(addedDecks));

// ── C. Lote nuevo con palabras ÚNICAS (para ver Reconocer/Producir) ─────────
console.log('\n══ C. Lote nuevo con palabras únicas ══');
const demoWords = [
	{ word: 'usbv2demo', level: 'B2', pos: 'noun', meaning: 'demo; verificación', sentence: 'The usbv2demo word proves the new card layout works.', sentenceTranslation: 'La palabra usbv2demo prueba que el nuevo formato funciona.', phonetic: '/ˈdɛmoʊ/', monolingual: 'a sample made to verify something', collocation: 'usbv2demo check' },
	{ word: 'usbv2sample', level: 'B2', pos: 'verb', meaning: 'muestrar; probar', sentence: 'They usbv2sample the data before shipping.', sentenceTranslation: 'Muestrean los datos antes de publicar.', phonetic: '/ˈsæmpəl/', monolingual: 'to test a small part of something', collocation: 'usbv2sample data' },
];
const { spec: v2spec, deckPath: v2deck } = bvsRepo(demoWords, 'USB QA — Curso de Prueba', '01 — Lección de Prueba', dvcRepo, 'https://www.udemy.com/course/qa/learn/lecture/42');
const v2apkgBuf = await assembleApkg(v2spec, PRISM_MEDIA);
const v2apkgPath = path.resolve('tmp/qa-vocab-v2-demo.apkg').split('\\').join('/');
fs.writeFileSync(v2apkgPath, v2apkgBuf);
await call('importPackage', { path: v2apkgPath });
console.log('  ✓ apkg demo (palabras únicas) importado');

const v2Nids = (await call('findNotes', { query: `note:"${NEW_MODEL}"` })).sort();
const v2New = v2Nids.filter((n) => !newModelNidsAfter.includes(n));
check('las palabras únicas crean notas con el modelo v2', v2New.length === 2, String(v2New.length));
if (v2New.length === 2) {
	const info = (await call('notesInfo', { notes: v2New }))[0];
	const fv = fieldsOf(info);
	check('nota v2: los 9 campos originales + nivel/colocacion/fuente/producir',
		fv.nivel === 'B2' && fv.colocacion === 'usbv2demo check' && fv.producir === '1',
		JSON.stringify({ nivel: fv.nivel, colocacion: fv.colocacion, fuente: fv.fuente.slice(0, 40), producir: fv.producir }));
	check('nota v2: fuente con enlace real a la lección (sin minuto, gate F2-1)',
		fv.fuente.includes('<a href="https://www.udemy.com/course/qa/learn/lecture/42">') && !fv.fuente.includes('?start='), fv.fuente);
	const cardIds = info.cards;
	check('nota v2: 2 tarjetas (Reconocer + Producir)', cardIds.length === 2, String(cardIds.length));
	const cards = await call('cardsInfo', { cards: cardIds });
	const ords = cards.map((c) => c.ord).sort().join(',');
	check('ords 0 y 1 (Reconocer + Producir)', ords === '0,1', ords);
	const tags = Array.isArray(info.tags) ? info.tags : String(info.tags || '').split(/\s+/);
	check('tags kinema:: jerárquicos', tags.includes('kinema::curso::usb-qa-curso-de-prueba') && tags.includes('kinema::cefr::b2'), info.tags);
}

// Reimportar el mismo paquete NO duplica.
const v2CountBefore = (await call('findNotes', { query: `note:"${NEW_MODEL}"` })).length;
await call('importPackage', { path: v2apkgPath });
const v2CountAfter = (await call('findNotes', { query: `note:"${NEW_MODEL}"` })).length;
check('reimportar el mismo paquete NO duplica (GUID)', v2CountAfter === v2CountBefore, `${v2CountBefore} → ${v2CountAfter}`);
// A1 real: los archivos de Prism llegaron a collection.media.
const mediaNames = await call('getMediaFilesNames', { pattern: '_kinema-prism*' });
check('los 2 archivos de Prism en collection.media (A1 real)', mediaNames.includes('_kinema-prism-v1.js') && mediaNames.includes('_kinema-prism-v1.css'), JSON.stringify(mediaNames));

// ── D. Render real: Reconocer y Producir (claro/noche) ──────────────────────
console.log('\n══ D. Render de Reconocer y Producir con el CSS real ══');
fs.mkdirSync('tmp/anki-preview', { recursive: true });
const templates = await call('modelTemplates', { modelName: NEW_MODEL });
const styling = await call('modelStyling', { modelName: NEW_MODEL });
const renderInfo = (await call('notesInfo', { notes: v2New }))[0];
const fields = fieldsOf(renderInfo);

function render(tmpl) {
	let out = tmpl.replace(/\{\{tts [^}]+\}\}/g,
		'<span style="display:inline-flex;width:34px;height:34px;border-radius:50%;border:1px solid rgba(128,128,128,.6);align-items:center;justify-content:center;font-size:15px;">🔊</span>');
	for (let pass = 0; pass < 8; pass += 1) {
		const next = out
			.replace(/\{\{#([\w ]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, f, inner) => (fields[f]?.trim() ? inner : ''))
			.replace(/\{\{\^([\w ]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, f, inner) => (fields[f]?.trim() ? '' : inner))
			.replace(/\{\{([\w ]+)\}\}/g, (_m, f) => fields[f] ?? '');
		if (next === out) break;
		out = next;
	}
	return out;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 880, height: 980 } });
const page = await context.newPage();
const shots = [];
const tplKeys = Object.keys(templates);
for (const card of (await call('cardsInfo', { cards: renderInfo.cards }))) {
	const tplKey = tplKeys[card.ord];
	const tmpl = templates[tplKey];
	for (const [face, key] of [['front', 'Front'], ['back', 'Back']]) {
		for (const dark of [false, true]) {
			const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styling.css}</style></head>
<body class="card${dark ? ' nightMode' : ''}">${render(tmpl[key])}</body></html>`;
			const file = path.resolve(`${SHOTS}/v2-${tplKey}-${face}-${dark ? 'dark' : 'light'}.html`);
			fs.writeFileSync(file, html);
			await page.goto('file:///' + file.replace(/\\/g, '/'));
			await page.waitForTimeout(1400);
			const png = path.resolve(`${SHOTS}/v2-${tplKey}-${face}-${dark ? 'dark' : 'light'}.png`);
			await page.screenshot({ path: png, fullPage: true });
			shots.push(png);
		}
	}
	console.log(`  tarjeta ord ${card.ord}: ${tplKey}`);
}
await browser.close();
console.log('  capturas:', shots.map((s) => path.basename(s)).join(', '));

// ── E. Limpieza (SOLO el árbol QA) ───────────────────────────────────────────
console.log('\n══ E. Limpieza (solo el árbol Kinema de QA) ══');
if (!KEEP) {
	const qaNotes = await call('findNotes', { query: `deck:"${ROOT_QA}"` });
	if (qaNotes.length) await call('deleteNotes', { notes: qaNotes });
	await call('deleteDecks', { decks: [ROOT_QA], cardsToo: true });
	const finalDecks = (await call('deckNames')).sort();
	check('árbol de prueba eliminado', !finalDecks.some((d) => d === ROOT_QA || d.startsWith(`${ROOT_QA}::`)));
	check('el resto de la colección intacto', JSON.stringify(finalDecks) === JSON.stringify(beforeDecks.sort()));
	const oldAfter = await call('findNotes', { query: `note:"${OLD_MODEL}"` });
	check('las notas viejas de la prueba también limpiadas', oldAfter.length === oldModelNidsBefore.length, `${oldModelNidsBefore.length} → ${oldAfter.length}`);
	console.log(`  notas borradas: ${qaNotes.length} (note types y presets se conservan para las exportaciones reales)`);
} else {
	console.log('  --keep: el árbol de prueba queda en Anki para revisarlo a mano');
}

console.log(failures === 0 ? '\n✅ VIEJO + NUEVO SIN DUPLICADOS OK' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
