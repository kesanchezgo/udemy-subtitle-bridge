/**
 * Render de Reconocer/Producir desde Anki real (notas --keep de
 * qa-anki-old-new.mjs): plantillas + CSS reales del note type importado.
 * Captura claro/noche, anverso/reverso de cada plantilla.
 *
 * Uso: node scripts/qa-anki-render-v2.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ANKI = 'http://127.0.0.1:8765';
const ROOT_QA = 'Kinema';
const NEW_MODEL = 'Kinema · Vocab · English';
const SHOTS = 'tmp/anki-preview';
fs.mkdirSync(SHOTS, { recursive: true });

async function call(action, params = {}) {
	const res = await fetch(ANKI, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}
const fieldsOf = (info) => Object.fromEntries(Object.entries(info.fields).map(([name, f]) => [name, f.value]));

const nids = await call('findNotes', { query: `note:"${NEW_MODEL}" deck:"${ROOT_QA}"` });
if (!nids.length) { console.error('sin notas v2 en el árbol QA (reinstala con qa-anki-old-new.mjs --keep)'); process.exit(1); }
const templates = await call('modelTemplates', { modelName: NEW_MODEL });
const styling = await call('modelStyling', { modelName: NEW_MODEL });
const infos = await call('notesInfo', { notes: nids });
const fields = fieldsOf(infos[0]);
const cards = await call('cardsInfo', { cards: infos[0].cards });

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

// modelTemplates devuelve { nombrePlantilla: { Front, Back } }; el ord de la
// tarjeta indexa el orden de creación de plantillas.
const tplKeys = Object.keys(templates);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 880, height: 980 } });
const page = await context.newPage();
const shots = [];
for (const card of cards) {
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
console.log('capturas:', shots.map((s) => path.basename(s)).join(', '));
