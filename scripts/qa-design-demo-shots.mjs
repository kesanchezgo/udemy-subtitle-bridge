/**
 * Capturas de las tarjetas demo "Qué cambió exactamente" (render real de
 * las plantillas del note type). Verifica también el limpiador de "💻".
 *
 * Uso: node scripts/qa-design-demo-shots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const MODEL = 'UB Concept · diseño nuevo';
const DECK = 'Kinema::(prueba) Qué cambió exactamente';

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

fs.mkdirSync('tmp/design-demo', { recursive: true });
const templates = await call('modelTemplates', { modelName: MODEL });
const styling = await call('modelStyling', { modelName: MODEL });
const tKey = Object.keys(templates)[0];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 880, height: 980 } });
const nids = await call('findNotes', { query: `note:"${MODEL}" deck:"${DECK}"` });
const infos = await call('notesInfo', { notes: nids });

let cleanerWorks = true;
for (let i = 0; i < infos.length; i += 1) {
	const fields = fieldsOf(infos[i]);
	for (const face of ['front', 'back']) {
		const tmpl = face === 'front' ? templates[tKey].Front : templates[tKey].Back;
		const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styling.css}</style></head><body class="card">${render(tmpl, fields)}</body></html>`;
		const file = path.resolve(`tmp/design-demo/tarjeta-${i + 1}-${face}.html`);
		fs.writeFileSync(file, html);
		await page.goto(`file:///${file.replace(/\\/g, '/')}`);
		await page.waitForTimeout(1300);
		await page.screenshot({ path: path.resolve(`tmp/design-demo/tarjeta-${i + 1}-${face}.png`), fullPage: true });
		console.log(`  ✓ tarjeta-${i + 1}-${face}.png`);
	}
	// El limpiador debe haber eliminado el prefijo "💻 CÓDIGO" del render
	const frontHtml = fs.readFileSync(`tmp/design-demo/tarjeta-${i + 1}-front.html`, 'utf8');
	if (fields.Front.includes('💻') && frontHtml.includes('💻')) cleanerWorks = false;
}
await browser.close();
console.log(`\nlimpiador de "💻 CÓDIGO" funcionando: ${cleanerWorks ? 'SÍ' : 'NO'}\nCapturas en tmp/design-demo/`);
