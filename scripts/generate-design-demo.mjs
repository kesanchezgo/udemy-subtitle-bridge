/**
 * Tarjetas de DEMOSTRACIÓN: qué cambió exactamente entre el diseño anterior
 * y el nuevo (Kinema) de las tarjetas Anki. Se crean con el note type nuevo
 * y muestran: los dos violetas, los iconos antes/después a 48px, y el
 * limpiador del prefijo "💻 CÓDIGO" en acción.
 *
 *   Kinema::(prueba) Qué cambió exactamente
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/generate-design-demo.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const JSZip = require('jszip');

const NEW = await import('../src/app/services/ankiDesign.ts');
const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');

async function call(action, params = {}) {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

const MODEL = 'UB Concept · diseño nuevo';
const DECK = 'Kinema::(prueba) Qué cambió exactamente';

// Los dos iconos peek reales, a 48px para que se vean
const ICON_OLD = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
const ICON_NEW = '<svg width="48" height="48" viewBox="0 0 256 256" fill="#2563eb"><path d="M108,84a16,16,0,1,1,16,16A16,16,0,0,1,108,84Zm128,44A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84,0,0,0,212,128Zm-72,36.68V132a20,20,0,0,0-20-20,12,12,0,0,0-4,23.32V168a20,20,0,0,0,20,20,12,12,0,0,0,4-23.32Z"/></svg>';

const swatches = `
<div style="display:flex;gap:14px;margin:14px 0">
	<div style="flex:1;text-align:center">
		<div style="height:72px;border-radius:14px;background:#6d28d9;border:1px solid rgba(0,0,0,.15)"></div>
		<p style="font-size:13px;margin:8px 0 0;font-weight:700">ANTES · #6d28d9</p>
	</div>
	<div style="flex:1;text-align:center">
		<div style="height:72px;border-radius:14px;background:#5b37e8"></div>
		<p style="font-size:13px;margin:8px 0 0;font-weight:700">DESPUÉS · #5b37e8</p>
	</div>
</div>
<p style="font-size:12px;opacity:.75">Es el mismo violeta casi hermano: un pelín más eléctrico. Por eso a simple vista parecen iguales — el cambio es de marca, no de legibilidad (ambos pasan contraste AA).</p>`;

const iconsDemo = `
<div style="display:flex;gap:18px;margin:14px 0;align-items:flex-end">
	<div style="text-align:center"><div style="padding:10px;border:1px dashed rgba(128,128,128,.5);border-radius:12px">${ICON_OLD}</div><p style="font-size:12px;margin:8px 0 0;font-weight:700">ANTES · trazo fino</p></div>
	<div style="text-align:center"><div style="padding:10px;border:1px dashed rgba(128,128,128,.5);border-radius:12px">${ICON_NEW}</div><p style="font-size:12px;margin:8px 0 0;font-weight:700">DESPUÉS · Phosphor relleno</p></div>
</div>
<p style="font-size:12px;opacity:.75">En la tarjeta real miden 13px (esquinas de los bloques «Definición monolingüe» y «Traducción» del vocabulario). A ese tamaño el cambio pasa desapercibido — aquí están a 48px.</p>`;

const notes = [
	{
		front: 'Tarjeta 1 · El violeta: ¿cambió mucho?',
		back: `<p>No — <b>es un ajuste de tono</b>, no un rediseño. Estos son los dos violetas reales, lado a lado:</p>${swatches}<p><b>Conclusión:</b> la diferencia existe (marca) pero es sutil a propósito. Contenido, estructura y campos: cero cambios.</p>`,
		leccion: '1 · El violeta',
		tipo: 'Concepto',
	},
	{
		front: 'Tarjeta 2 · Los iconitos de las esquinas',
		back: `<p>Los dos iconitos de la tarjeta de vocabulario cambiaron de estilo (no de función):</p>${iconsDemo}<p><b>Conclusión:</b> mismo significado, mismo sitio, mismo tamaño — solo el estilo del trazo cambió, coherente con los iconos nuevos de la extensión.</p>`,
		leccion: '2 · Los iconos',
		tipo: 'Concepto',
	},
	{
		// El campo Front CONTIENE el prefijo "💻 CÓDIGO" a propósito:
		// la plantilla lo elimina al mostrar → demostración del limpiador.
		front: '💻 CÓDIGO ¿Qué imprime <code>System.out.println(1 + 2 + 3)</code> y por qué?',
		back: `<p>Si lees esta pregunta <b>sin ningún "💻 CÓDIGO" delante</b>, el limpiador funcionó.</p><p>Lo que pasó: el campo de esta tarjeta <b>contiene literalmente</b> «💻 CÓDIGO ¿Qué imprime…?» — pero la plantilla de la tarjeta elimina ese prefijo al renderizar.</p><div class="warning-box">¿Y por qué existe ese limpiador? Porque la IA está <b>prohibida</b> (por el prompt) de decorar las tarjetas con rótulos como «💻 CÓDIGO» — el diseño de la tarjeta ya pone su propia cabecera. La IA no genera emojis en las tarjetas: genera la pregunta/respuesta limpia, y el marco lo pone la plantilla. El limpiador es el plan B si la IA desobedece.</div>`,
		leccion: '3 · El limpiador de 💻',
		tipo: 'Código',
	},
];

const spec = {
	decks: [
		{ name: 'Kinema', conf: NEW.COURSES_PRESET.id, desc: 'Mazos de prueba de diseño — borrar libremente.' },
		{ name: DECK, conf: NEW.COURSES_PRESET.id, desc: 'Demostración de qué cambió entre el diseño anterior y el nuevo. Borrar tras revisar.' },
	],
	models: [{ id: NEW.stableNumericId(MODEL, 1_660_000_000_000), name: MODEL, sortf: 0, fields: [...NEW.CONCEPT_MODEL.fields], templates: [{ name: 'Concepto', qfmt: NEW.CONCEPT_MODEL.templates[0].qfmt, afmt: NEW.CONCEPT_MODEL.templates[0].afmt }], css: NEW.CONCEPT_MODEL.css }],
	dconfs: [NEW.COURSES_PRESET, NEW.VOCAB_PRESET],
	notes: notes.map((n, i) => ({
		modelName: MODEL,
		deck: DECK,
		guid: NEW.stableGuid(`cmp-demo|${i}`),
		fields: [n.front, n.back, n.leccion, '', n.tipo],
		tags: ['prueba-diseno'],
	})),
};

const sqlite = await buildCollectionBuffer(spec, await initSqlJs());
const zip = new JSZip();
zip.file('collection.anki2', sqlite);
zip.file('media', '{}');
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const apkg = path.resolve('tmp/design-demo.apkg').replace(/\\/g, '/');
fs.mkdirSync(path.dirname(apkg), { recursive: true });
fs.writeFileSync(apkg, buf);
if (!(await call('deckNames')).includes(DECK)) await call('createDeck', { deck: DECK });
await call('importPackage', { path: apkg });
console.log(`✓ importado: ${DECK} (${notes.length} tarjetas demo)`);
console.log('Borra el mazo cuando termines de revisar.');
