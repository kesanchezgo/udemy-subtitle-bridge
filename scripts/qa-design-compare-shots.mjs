/**
 * Capturas lado a lado: diseño ANTERIOR vs NUEVO (Kinema) de las tarjetas
 * de prueba, renderizadas con las plantillas/CSS reales de cada note type.
 *
 * Uso: node scripts/qa-design-compare-shots.mjs
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
	let out = tmpl.replace(/\{\{tts [^}]+\}\}/g, '🔊');
	for (let pass = 0; pass < 8; pass += 1) {
		const next = out
			.replace(/\{\{#([\w ]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, f, inner) => (fields[f]?.trim() ? inner : ''))
			.replace(/\{\{([\w ]+)\}\}/g, (_m, f) => fields[f] ?? '');
		if (next === out) break;
		out = next;
	}
	return out;
}

const VARIANTS = [
	{ model: 'UB Concept · diseño anterior', tag: 'anterior' },
	{ model: 'UB Concept · diseño nuevo', tag: 'nuevo' },
	{ model: 'UB Vocab · diseño anterior', tag: 'anterior' },
	{ model: 'UB Vocab · diseño nuevo', tag: 'nuevo' },
];

fs.mkdirSync('tmp/design-compare', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 880, height: 980 } });

for (const v of VARIANTS) {
	const templates = await call('modelTemplates', { modelName: v.model });
	const styling = await call('modelStyling', { modelName: v.model });
	const nids = await call('findNotes', { query: `note:"${v.model}"` });
	const fields = fieldsOf((await call('notesInfo', { notes: nids }))[0]);
	const isVocab = v.model.includes('Vocab');
	// Ambos note types tienen una sola plantilla; la clave del map es su nombre
	const tKeys = Object.keys(templates);
	const front = templates[tKeys[0]].Front;
	const back = templates[tKeys[0]].Back;
	for (const [face, tmpl] of [['front', front], ['back', back]]) {
		const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styling.css}</style></head>
<body class="card${v.tag === 'nuevo' && !isVocab ? '' : ''}">${render(tmpl, fields)}</body></html>`;
		const file = path.resolve(`tmp/design-compare/${isVocab ? 'vocab' : 'concepto'}-${face}-${v.tag}.html`);
		fs.writeFileSync(file, html);
		await page.goto('file:///' + file.replace(/\\/g, '/'));
		await page.waitForTimeout(1400);
		const png = path.resolve(`tmp/design-compare/${isVocab ? 'vocab' : 'concepto'}-${face}-${v.tag}.png`);
		await page.screenshot({ path: png, fullPage: true });
		console.log('  ✓', path.basename(png));
	}
}
await browser.close();
console.log('\nComparación en tmp/design-compare/');
