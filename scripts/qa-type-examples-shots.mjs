/**
 * Capturas de las 6 tarjetas "Ejemplos por tipo" (una por tipo de tarjeta),
 * renderizadas con las plantillas reales del note type en Anki.
 *
 * Uso: node scripts/qa-type-examples-shots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

async function call(action, params = {}) {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

const fieldsOf = (info) => Object.fromEntries(Object.entries(info.fields).map(([name, f]) => [name, f.value]));

function render(tmpl, fields) {
	let out = tmpl;
	for (let pass = 0; pass < 8; pass += 1) {
		const next = out
			.replace(/\{\{#([\w ]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, f, inner) => (fields[f]?.trim() ? inner : ''))
			.replace(/\{\{([\w ]+)\}\}/g, (_m, f) => fields[f] ?? '');
		if (next === out) break;
		out = next;
	}
	return out;
}

const DECK = 'Kinema::(prueba) Ejemplos por tipo';
const MODEL = 'Udemy Bridge Concept';

const templates = await call('modelTemplates', { modelName: MODEL });
const styling = await call('modelStyling', { modelName: MODEL });
const tKey = Object.keys(templates)[0];

const nids = await call('findNotes', { query: `deck:"${DECK}"` });
const infos = await call('notesInfo', { notes: nids });

fs.mkdirSync('tmp/type-examples', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 880, height: 980 } });

for (const info of infos) {
	const fields = fieldsOf(info);
	// El campo Tipo ahora trae <span data-tp="tipo">…</span> — extraer el valor limpio
	const tpMatch = /data-tp="(\w+)"/.exec(fields.Tipo ?? '');
	const tipo = tpMatch ? tpMatch[1] : 'tipo';
	for (const face of ['front', 'back']) {
		const tmpl = face === 'front' ? templates[tKey].Front : templates[tKey].Back;
		const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styling.css}</style></head><body class="card">${render(tmpl, fields)}</body></html>`;
		const file = path.resolve(`tmp/type-examples/${tipo}-${face}.html`);
		fs.writeFileSync(file, html);
		await page.goto(`file:///${file.replace(/\\/g, '/')}`);
		await page.waitForTimeout(1400);
		const png = path.resolve(`tmp/type-examples/${tipo}-${face}.png`);
		await page.screenshot({ path: png, fullPage: true });
		console.log(`  ✓ ${tipo}-${face}.png`);
	}
}
await browser.close();
console.log('\nCapturas en tmp/type-examples/');
