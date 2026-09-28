/**
 * Prueba REAL de importación en Anki Desktop (vía AnkiConnect):
 *
 *   A. Snapshot del estado (mazos, preset Default del usuario).
 *   B. Importa tmp/qa-concept.apkg y tmp/qa-vocab.apkg (generados por
 *      scripts/qa-anki-decks.mjs con el código de producción).
 *   C. Verifica en la colección viva: árbol de mazos, preset dedicado aplicado
 *      (NO "Default"), campos y notas, y que NADA ajeno cambió.
 *   D. Renderiza las tarjetas con el CSS/plantillas reales del note type
 *      importado y captura PNGs (claro/oscuro, anverso/reverso).
 *   E. Limpieza: borra SOLO el árbol "Udemy Bridge" de prueba (notas + mazos).
 *
 * Uso: node scripts/qa-anki-import-verify.mjs [--keep]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ANKI = 'http://127.0.0.1:8765';
const KEEP = process.argv.includes('--keep');

async function call(action, params = {}) {
	const res = await fetch(ANKI, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

let failures = 0;
function check(name, condition, detail = '') {
	if (condition) console.log(`  ✓ ${name}`);
	else {
		failures += 1;
		console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

// ── A. snapshot ──────────────────────────────────────────────────────────────
console.log('══ A. Snapshot del estado previo ══');
const beforeDecks = (await call('deckNames')).sort();
console.log(`  mazos previos: ${beforeDecks.length}`);
const defaultConfBefore = await call('getDeckConfig', { deck: 'Default' });
console.log(`  Default: perDay=${defaultConfBefore.new.perDay} retention=${defaultConfBefore.desiredRetention}`);

// ── B. import ────────────────────────────────────────────────────────────────
console.log('\n══ B. Importando paquetes de prueba ══');
const conceptApkg = path.resolve('tmp/qa-concept.apkg').replace(/\\/g, '/');
const vocabApkg = path.resolve('tmp/qa-vocab.apkg').replace(/\\/g, '/');
await call('importPackage', { path: conceptApkg });
console.log('  ✓ qa-concept.apkg importado');
await call('importPackage', { path: vocabApkg });
console.log('  ✓ qa-vocab.apkg importado');

// ── C. verificación en colección viva ───────────────────────────────────────
console.log('\n══ C. Verificación en Anki ══');
const ROOT = 'Udemy Bridge';
const COURSE = 'USB QA — Curso de Prueba';
const LESSON = '01 — Lección de Prueba';
const lessonDeck = `${ROOT}::Courses::${COURSE}::${LESSON}`;
const vocabDeck = `${ROOT}::Vocabulary::English::${COURSE}`;

const afterDecks = (await call('deckNames')).sort();
const added = afterDecks.filter((d) => !beforeDecks.includes(d));
const removed = beforeDecks.filter((d) => !afterDecks.includes(d));
console.log('  mazos añadidos:', JSON.stringify(added, null, 1));
check('mazos de lección y vocabulario presentes', afterDecks.includes(lessonDeck) && afterDecks.includes(vocabDeck));
check('solo se añadieron mazos bajo la raíz de la extensión', added.every((d) => d === ROOT || d.startsWith(`${ROOT}::`)) && removed.length === 0, JSON.stringify(removed));

	const lessonConf = await call('getDeckConfig', { deck: lessonDeck });
	console.log(`  preset de lección: "${lessonConf.name}" perDay=${lessonConf.new.perDay} delays=${JSON.stringify(lessonConf.new.delays)} lapseMult=${lessonConf.lapse.mult} leech=${lessonConf.lapse.leechAction} retention=${lessonConf.desiredRetention}`);
	check('mazos de la extensión usan preset PROPIO (no Default)', lessonConf.name === 'Udemy Bridge · Cursos' && lessonConf.id !== 1);
	check('config pedagógica aplicada (20/día, [1,10], lapso 30%, leech tag)', lessonConf.new.perDay === 20
		&& JSON.stringify(lessonConf.new.delays) === '[1,10]'
		&& lessonConf.lapse.mult === 0.3
		&& lessonConf.lapse.leechAction === 1);
	console.log(`  fsrs en preset importado: ${'fsrs' in lessonConf ? lessonConf.fsrs : '(clave no expuesta por getDeckConfig)'}`);

	const vocabTemplates = await call('modelTemplates', { modelName: 'Udemy Bridge Vocab' });
	const tplJson = JSON.stringify(vocabTemplates);
	check('plantilla de vocabulario reproduce ARCHIVOS de calidad (word/sentence audio)',
		tplJson.includes('{{#word audio}}') && tplJson.includes('{{sentence audio}}') && !tplJson.includes('{{tts'));

const vocabConf = await call('getDeckConfig', { deck: vocabDeck });
check('mazo de vocabulario usa preset "Udemy Bridge · Vocabulario" (15/día)', vocabConf.name === 'Udemy Bridge · Vocabulario' && vocabConf.new.perDay === 15, `${vocabConf.name} ${vocabConf.new.perDay}`);

const defaultConfAfter = await call('getDeckConfig', { deck: 'Default' });
check('preset "Default" del usuario INTOCO', defaultConfAfter.new.perDay === defaultConfBefore.new.perDay
	&& defaultConfAfter.name === 'Default' && defaultConfAfter.id === 1);

const modelNames = (await call('modelNames')).sort();
check('note types propios creados', modelNames.includes('Udemy Bridge Concept') && modelNames.includes('Udemy Bridge Vocab'));

const conceptNids = await call('findNotes', { query: `deck:"${lessonDeck}"` });
check('3 notas de concepto importadas', conceptNids.length === 3, String(conceptNids.length));
const fieldsOf = (info) => Object.fromEntries(Object.entries(info.fields).map(([name, f]) => [name, f.value]));

const conceptInfo = (await call('notesInfo', { notes: conceptNids }))[0];
const conceptFields = fieldsOf(conceptInfo);
check('nota de concepto: Leccion y Fuente rellenos', conceptFields.Leccion === LESSON && conceptFields.Fuente.includes('Repasar esta lección'));

const vocabNids = await call('findNotes', { query: `deck:"${vocabDeck}"` });
check('3 notas de vocabulario importadas', vocabNids.length === 3, String(vocabNids.length));
const vocabInfo = (await call('notesInfo', { notes: vocabNids }))[0];
const vocabFields = fieldsOf(vocabInfo);
check('nota de vocabulario: word/sentence/translation/bilingual rellenos, picture vacío',
	Boolean(vocabFields.word) && Boolean(vocabFields.sentence) && Boolean(vocabFields.translation) && Boolean(vocabFields.bilingual) && vocabFields.picture === '');
console.log(`  ejemplo: word="${vocabFields.word}" | ${vocabFields.sentence}`);

// Duplicados: reimportar el MISMO paquete no debe crear notas nuevas.
await call('importPackage', { path: conceptApkg });
const conceptNids2 = await call('findNotes', { query: `deck:"${lessonDeck}"` });
check('reimportar NO duplica (GUID por contenido)', conceptNids2.length === 3, String(conceptNids2.length));

// ── D. capturas de las tarjetas (CSS/plantillas reales del note type) ───────
console.log('\n══ D. Capturas de las tarjetas ══');
fs.mkdirSync('tmp/anki-preview', { recursive: true });

async function renderCards({ modelName, noteIds, fileBase }) {
	const templates = await call('modelTemplates', { modelName });
	const styling = await call('modelStyling', { modelName });
	const infos = await call('notesInfo', { notes: noteIds });
	const cardIds = infos[0].cards;
	const fields = fieldsOf(infos[0]);

	function render(tmpl) {
		// {{tts ...}} → botón de prueba (Anki lo sustituye por su reproductor
		// nativo; aquí solo simulamos el hueco visual).
		let out = tmpl.replace(/\{\{tts [^}]+\}\}/g,
			'<span style="display:inline-flex;width:34px;height:34px;border-radius:50%;border:1px solid rgba(128,128,128,.6);align-items:center;justify-content:center;font-size:15px;">🔊</span>');
		// mustache-lite con anidamiento: repite pasadas hasta estabilizar.
		// {{#f}}...{{/f}} se conserva si el campo tiene contenido, si no se
		// elimina el bloque completo; {{f}} se sustituye por el valor.
		for (let pass = 0; pass < 8; pass += 1) {
			const next = out
				.replace(/\{\{#([\w ]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, f, inner) => (fields[f]?.trim() ? inner : ''))
				.replace(/\{\{([\w ]+)\}\}/g, (_m, f) => fields[f] ?? '');
			if (next === out) break;
			out = next;
		}
		return out;
	}

	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 880, height: 980 } });
	const shots = [];
	for (const [face, tmpl] of [['front', templates[Object.keys(templates)[0]].Front], ['back', templates[Object.keys(templates)[0]].Back]]) {
		for (const dark of [false, true]) {
			const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styling.css}</style></head>
<body class="card${dark ? ' nightMode' : ''}">${render(tmpl)}</body></html>`;
			const file = path.resolve(`tmp/anki-preview/${fileBase}-${face}-${dark ? 'dark' : 'light'}.html`);
			fs.writeFileSync(file, html);
			await page.goto('file:///' + file.replace(/\\/g, '/'));
			await page.waitForTimeout(face === 'front' ? 1600 : 1600);
			const png = path.resolve(`tmp/anki-preview/${fileBase}-${face}-${dark ? 'dark' : 'light'}.png`);
			await page.screenshot({ path: png, fullPage: true });
			shots.push(png);
		}
	}
	await browser.close();
	return shots;
}

const conceptCards = await call('cardsInfo', { cards: (await call('findCards', { query: `deck:"${lessonDeck}"` })).slice(0, 1) });
const shotsConcept = await renderCards({ modelName: 'Udemy Bridge Concept', noteIds: conceptCards.map((c) => c.note), fileBase: 'concepto' });
const vocabCards = await call('cardsInfo', { cards: (await call('findCards', { query: `deck:"${vocabDeck}"` })).slice(0, 1) });
const shotsVocab = await renderCards({ modelName: 'Udemy Bridge Vocab', noteIds: vocabCards.map((c) => c.note), fileBase: 'vocabulario' });
console.log('  capturas:', [...shotsConcept, ...shotsVocab].map((p) => path.basename(p)).join(', '));

// ── E. limpieza (SOLO el árbol de prueba) ───────────────────────────────────
console.log('\n══ E. Limpieza ══');
if (!KEEP) {
	const testNotes = await call('findNotes', { query: `deck:"${ROOT}"` });
	if (testNotes.length) await call('deleteNotes', { notes: testNotes });
	await call('deleteDecks', { decks: [ROOT], cardsToo: true });
	const finalDecks = (await call('deckNames')).sort();
	check('árbol de prueba eliminado', !finalDecks.some((d) => d === ROOT || d.startsWith(`${ROOT}::`)));
	const expectedFinal = beforeDecks.filter((d) => !(d === ROOT || d.startsWith(`${ROOT}::`))).sort();
	check('resto de la colección intacto', JSON.stringify(finalDecks) === JSON.stringify(expectedFinal));
	console.log(`  notas borradas: ${testNotes.length} (los note types y presets quedan: los reutilizarán las exportaciones reales)`);
} else {
	console.log('  --keep: se conserva el árbol de prueba en Anki');
}

console.log(failures === 0 ? '\n✅ IMPORTACIÓN REAL OK' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
