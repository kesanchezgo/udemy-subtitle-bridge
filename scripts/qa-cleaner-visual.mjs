/**
 * Demostración visual del limpiador "💻 CÓDIGO":
 * renderiza la MISMA tarjeta dos veces —
 *   1. SIN el script limpiador (como se vería si la plantilla no lo tuviera)
 *   2. CON el script limpiador (como se ve en Anki)
 *
 * Uso: node scripts/qa-cleaner-visual.mjs
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

const MODEL = 'UB Concept · diseño nuevo';
const templates = await call('modelTemplates', { modelName: MODEL });
const styling = await call('modelStyling', { modelName: MODEL });
const tKey = Object.keys(templates)[0];

const nids = await call('findNotes', { query: `note:"${MODEL}" deck:"Udemy Bridge::(prueba) Qué cambió exactamente"` });
const infos = await call('notesInfo', { notes: nids });
const target = infos.find((n) => Object.values(n.fields).some((f) => f.value.includes('💻')));
const fields = Object.fromEntries(Object.entries(target.fields).map(([name, f]) => [name, f.value]));

function render(tmpl, fields, withScripts) {
	// Sin scripts: el limpiador no existe → el prefijo 💻 se queda.
	let body = withScripts ? tmpl : tmpl.replace(/<script>[\s\S]*?<\/script>/g, '');
	for (let pass = 0; pass < 8; pass += 1) {
		const next = body
			.replace(/\{\{#([\w ]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, f, inner) => (fields[f]?.trim() ? inner : ''))
			.replace(/\{\{([\w ]+)\}\}/g, (_m, f) => fields[f] ?? '');
		if (next === body) break;
		body = next;
	}
	return body;
}

fs.mkdirSync('tmp/cleaner-demo', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 880, height: 780 } });

for (const [name, withScripts] of [['1-sin-limpiador', false], ['2-con-limpiador', true]]) {
	const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styling.css}</style></head><body class="card">${render(templates[tKey].Front, fields, withScripts)}</body></html>`;
	const file = path.resolve(`tmp/cleaner-demo/${name}.html`);
	fs.writeFileSync(file, html);
	await page.goto(`file:///${file.replace(/\\/g, '/')}`);
	await page.waitForTimeout(1300);
	await page.screenshot({ path: path.resolve(`tmp/cleaner-demo/${name}.png`), fullPage: true });
	console.log(`  ✓ ${name}.png`);
}
await browser.close();
console.log('\nComparación en tmp/cleaner-demo/');
