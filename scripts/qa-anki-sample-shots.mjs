/**
 * Capturas de los mazos demo dejados en Anki (una por tipo de tarjeta clave)
 * usando las plantillas/CSS REALES del note type importado.
 *
 * Uso: node scripts/qa-anki-sample-shots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = 'Udemy Bridge';

async function call(action, params = {}) {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

const modelCache = new Map();
async function getModel(modelName) {
	if (!modelCache.has(modelName)) {
		const templates = await call('modelTemplates', { modelName });
		const styling = await call('modelStyling', { modelName });
		const [qName, aName] = Object.keys(templates);
		modelCache.set(modelName, { front: templates[qName].Front, back: templates[qName].Back, css: styling.css });
	}
	return modelCache.get(modelName);
}

const fieldsOf = (info) => Object.fromEntries(Object.entries(info.fields).map(([name, f]) => [name, f.value]));

function render(tmpl, fields) {
	let out = tmpl.replace(/\{\{tts [^}]+\}\}/g,
		'<span style="display:inline-flex;width:34px;height:34px;border-radius:50%;border:1px solid rgba(128,128,128,.6);align-items:center;justify-content:center;font-size:15px;">🔊</span>');
	for (let pass = 0; pass < 8; pass += 1) {
		const next = out
			.replace(/\{\{#([\w ]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, f, inner) => (fields[f]?.trim() ? inner : ''))
			.replace(/\{\{([\w ]+)\}\}/g, (_m, f) => fields[f] ?? '');
		if (next === out) break;
		out = next;
	}
	return out;
}

const SHOTS = [
	{ deck: `${ROOT}::Courses::Spring Boot: De Cero a Senior [2026]::12. Transacciones y @Transactional`, match: '@Transactional</code> sobre un método', face: 'front', dark: false, out: 'spring-concepto-front-light' },
	{ deck: `${ROOT}::Courses::Spring Boot: De Cero a Senior [2026]::12. Transacciones y @Transactional`, match: 'imprime el log', face: 'front', dark: false, out: 'spring-codigo-front-light' },
	{ deck: `${ROOT}::Courses::Spring Boot: De Cero a Senior [2026]::12. Transacciones y @Transactional`, match: 'imprime el log', face: 'back', dark: true, out: 'spring-codigo-back-dark' },
	{ deck: `${ROOT}::Courses::Spring Boot: De Cero a Senior [2026]::12. Transacciones y @Transactional`, match: 'REQUIRED', face: 'back', dark: false, out: 'spring-comparacion-back-light' },
	{ deck: `${ROOT}::Courses::Spring Boot: De Cero a Senior [2026]::12. Transacciones y @Transactional`, match: 'llama a otro método del mismo bean', face: 'back', dark: false, out: 'spring-entrevista-back-light' },
	{ deck: `${ROOT}::Courses::Hacking Ético: Fundamentos y Recon [2026]::05. Enumeración de servicios con Nmap`, match: 'versiones de servicio', face: 'back', dark: false, out: 'hacking-codigo-back-light' },
	{ deck: `${ROOT}::Courses::Hacking Ético: Fundamentos y Recon [2026]::05. Enumeración de servicios con Nmap`, match: 'tumbar servicios legacy', face: 'back', dark: true, out: 'hacking-warning-back-dark' },
	{ deck: `${ROOT}::Courses::Excel para Análisis de Datos [2026]::08. BUSCARV, ÍNDICE y COINCIDIR`, match: 'BUSCARV</b> vs', face: 'back', dark: false, out: 'excel-comparacion-back-light' },
	{ deck: `${ROOT}::Courses::Excel para Análisis de Datos [2026]::08. BUSCARV, ÍNDICE y COINCIDIR`, match: 'precio</b>', face: 'back', dark: false, out: 'excel-formula-back-light' },
	{ deck: `${ROOT}::Vocabulary::English::Spring Boot: De Cero a Senior [2026]`, match: 'pitfall', face: 'front', dark: false, out: 'vocab-en-front-light' },
	{ deck: `${ROOT}::Vocabulary::English::Spring Boot: De Cero a Senior [2026]`, match: 'pitfall', face: 'back', dark: false, out: 'vocab-en-back-light' },
	{ deck: `${ROOT}::Vocabulary::Japanese::Japonés para Profesionales: N4 a N3 [2026]`, match: '確認', face: 'front', dark: false, out: 'vocab-ja-front-light' },
	{ deck: `${ROOT}::Vocabulary::Japanese::Japonés para Profesionales: N4 a N3 [2026]`, match: '確認', face: 'back', dark: false, out: 'vocab-ja-back-light' },
	{ deck: `${ROOT}::Vocabulary::Japanese::Japonés para Profesionales: N4 a N3 [2026]`, match: '覚える', face: 'back', dark: true, out: 'vocab-ja-back-dark' },
];

const notesCache = new Map();
async function findNote(deck, match) {
	const key = deck;
	if (!notesCache.has(key)) {
		const nids = await call('findNotes', { query: `deck:"${deck}"` });
		const infos = nids.length ? await call('notesInfo', { notes: nids }) : [];
		notesCache.set(key, infos.map((info) => fieldsOf(info)));
	}
	const notes = notesCache.get(key);
	const note = notes.find((f) => Object.values(f).some((v) => String(v).includes(match)));
	if (!note) throw new Error(`Nota no encontrada en ${deck} por "${match}" (hay ${notes.length})`);
	return note;
}

fs.mkdirSync('tmp/anki-preview/samples', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 880, height: 980 } });

for (const shot of SHOTS) {
	const modelName = shot.deck.includes('Vocabulary') ? 'Udemy Bridge Vocab' : 'Udemy Bridge Concept';
	const model = await getModel(modelName);
	const note = await findNote(shot.deck, shot.match);
	const tmpl = shot.face === 'front' ? model.front : model.back;
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>${model.css}</style></head>
<body class="card${shot.dark ? ' nightMode' : ''}">${render(tmpl, note)}</body></html>`;
	const file = path.resolve(`tmp/anki-preview/samples/${shot.out}.html`);
	fs.writeFileSync(file, html);
	await page.goto('file:///' + file.replace(/\\/g, '/'));
	await page.waitForTimeout(1500);
	const png = path.resolve(`tmp/anki-preview/samples/${shot.out}.png`);
	await page.screenshot({ path: png, fullPage: true });
	console.log('  ✓', path.basename(png));
}
await browser.close();
console.log(`\n${SHOTS.length} capturas en tmp/anki-preview/samples/`);
