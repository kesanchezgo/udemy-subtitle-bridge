/** Verificación del limpiador "💻 CÓDIGO": modelo en Anki + DOM vivo. */
import fs from 'node:fs';
import { chromium } from 'playwright';

async function call(action, params = {}) {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

const MODEL = 'UB Concept · diseño nuevo';
const templates = await call('modelTemplates', { modelName: MODEL });
const tpl = JSON.stringify(templates);
const m = tpl.match(/replace\([^)]{0,40}/);
console.log('regex en el modelo (trozo):', m ? m[0] : '(no hallado)');

function fieldsOf(info) {
	return Object.fromEntries(Object.entries(info.fields).map(([name, f]) => [name, f.value]));
}

const nids = await call('findNotes', { query: `note:"${MODEL}" deck:"Kinema::(prueba) Qué cambió exactamente"` });
const infos = await call('notesInfo', { notes: nids });
const target = infos.find((n) => fieldsOf(n).Front.includes('💻'));
if (!target) throw new Error('no encontré la nota demo del limpiador');
const fields = fieldsOf(target);
console.log('campo Front contiene 💻:', fields.Front.includes('💻'));

const styling = await call('modelStyling', { modelName: MODEL });
const tKey = Object.keys(templates)[0];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styling.css}</style></head><body class="card">${templates[tKey].Front.replace(/\{\{Front\}\}/g, fields.Front).replace(/\{\{Leccion\}\}/g, fields.Leccion)}</body></html>`;
fs.writeFileSync('tmp/cleaner-live.html', html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 880, height: 980 } });
await page.goto(`file:///${process.cwd().replace(/\\/g, '/')}/tmp/cleaner-live.html`);
await page.waitForTimeout(1200);
const liveText = await page.evaluate(() => document.getElementById('qa')?.innerText ?? '(sin #qa)');
console.log('texto vivo del front:', JSON.stringify(liveText.slice(0, 90)));
const hasEmoji = liveText.includes('💻');
console.log(hasEmoji ? '❌ el limpiador NO eliminó el prefijo' : '✅ el limpiador eliminó el prefijo');
await page.screenshot({ path: 'tmp/cleaner-live.png', fullPage: true });
await browser.close();
process.exit(hasEmoji ? 1 : 0);
