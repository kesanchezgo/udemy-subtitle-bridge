/**
 * Una tarjeta de EJEMPLO POR CADA TIPO (concepto/codigo/comparacion/proceso/
 * entrevista/aplicacion) con datos reales de un curso de Spring Boot, cada una
 * con su píldora de tipo — para ver cómo se identifica cada tipo en Anki.
 *
 *   Udemy Bridge::(prueba) Ejemplos por tipo   (6 tarjetas, borrar al terminar)
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/generate-type-examples.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const JSZip = require('jszip');

const NEW = await import('../src/app/services/ankiDesign.ts');
const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');
const { stableGuid, tipoFieldValue } = await import('../src/app/services/ankiDesign.ts');

async function call(action, params = {}) {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

const COURSE = 'Spring Boot: De Cero a Senior [2026]';
const LESSON = '12. Transacciones y @Transactional';
const DECK = 'Udemy Bridge::(prueba) Ejemplos por tipo';

const cards = [
	{
		type: 'concepto',
		front: '¿Qué garantiza <code>@Transactional</code> sobre un método de servicio y cuándo hace rollback por defecto?',
		back: '<p>Garantiza que las operaciones del método corren dentro de <b>una única transacción</b>: o todo se confirma (commit) o todo se revierte.</p><p>Por defecto hace rollback solo ante <code>RuntimeException</code> y <code>Error</code>; las excepciones checked <b>no</b> revierten.</p><div class="concept-box">Para revertir con excepciones checked: <code>@Transactional(rollbackFor = Exception.class)</code>.</div>',
		tags: ['spring', 'transacciones'],
	},
	{
		type: 'codigo',
		front: `¿Qué imprime el log al ejecutar <code>servicio.procesar()</code> si <code>guardar()</code> lanza <code>RuntimeException</code>?<pre><code class="language-java">@Service
public class Servicio {
    @Transactional
    public void procesar() {
        guardar();  // lanza RuntimeException
        System.out.println("guardado");
    }
}</code></pre>`,
		back: `<p>No imprime nada: <code>guardar()</code> lanza la excepción y <code>procesar()</code> la propaga sin llegar al <code>println</code>.</p><pre><code class="language-java">// Comportamiento real:
// 1. guardar() abre TX_NUEVA (REQUIRES_NEW)
// 2. RuntimeException marca TX_NUEVA como rollback-only
// 3. procesar() recibe la excepción → su TX exterior también revierte</code></pre><div class="warning-box">La llamada es al propio bean (<b>self-invocation</b>): el proxy de Spring NO aplica <code>REQUIRES_NEW</code>. Fallo clásico de entrevista.</div>`,
		tags: ['spring', 'codigo', 'proxy'],
	},
	{
		type: 'comparacion',
		front: 'Compará <code>Propagation.REQUIRED</code> vs <code>REQUIRES_NEW</code>: ¿cuándo usar cada uno?',
		back: '<table><tr><th></th><th>REQUIRED</th><th>REQUIRES_NEW</th></tr><tr><td>Si ya hay TX</td><td>se une a la existente</td><td>suspende la actual y abre otra</td></tr><tr><td>Rollback del interior</td><td>revierte TODO (misma TX)</td><td>solo revierte la TX nueva</td></tr><tr><td>Uso típico</td><td>operaciones de negocio</td><td>auditoría que debe persistir aunque falle</td></tr></table>',
		tags: ['spring', 'transacciones'],
	},
	{
		type: 'proceso',
		front: 'Ordená los pasos para que una prueba de integración quede aislada de la base de datos real.',
		back: '<ol><li>Anotar la prueba con <code>@SpringBootTest</code> + <code>@Transactional</code> (rollback automático al terminar).</li><li>Apuntar a una BD efímera (H2/Testcontainers) con <code>@ActiveProfiles("test")</code>.</li><li>Seed mínimo de datos con <code>@Sql</code> o builders.</li><li>Ejecutar el caso y afirmar sobre el estado dentro de la TX de prueba.</li></ol>',
		tags: ['spring', 'testing'],
	},
	{
		type: 'entrevista',
		front: 'Entrevista: «¿Por qué @Transactional no funciona cuando un método llama a otro método del mismo bean?»',
		back: '<div class="interview-box"><div class="label">Entrevista</div><ul><li><b>La causa:</b> Spring aplica transaccionalidad con un <b>proxy AOP</b> que envuelve el bean.</li><li>La llamada interna (<code>this.metodo()</code>) salta el proxy: las anotaciones internas se ignoran.</li><li><b>Soluciones:</b> dividir en dos beans, inyectarse a sí mismo, o <code>TransactionTemplate</code> programático.</li><li><b>Frase de cierre:</b> «la anotación vive en el proxy, no en el objeto».</li></ul></div>',
		tags: ['spring', 'entrevista'],
	},
	{
		type: 'aplicacion',
		front: 'Caso real: el email de confirmación se envía aunque la transacción luego hace rollback. ¿Por qué ocurre y cómo lo arreglás?',
		back: '<p>Ocurre porque el envío se ejecuta <b>dentro</b> del método transaccional, antes de saber si hará commit.</p><p>Arreglo: mover el envío a <b>después del commit</b> con <code>@TransactionalEventListener(phase = AFTER_COMMIT)</code>.</p><div class="tip-box">Regla: dentro de la TX solo operaciones transaccionales; efectos secundarios (email, colas) van after-commit.</div>',
		tags: ['spring', 'diseno'],
	},
];

const lessonUrl = 'https://www.udemy.com/course/spring-boot-demo/learn/lecture/1';
const spec = {
	decks: [
		{ name: 'Udemy Bridge', conf: NEW.COURSES_PRESET.id, desc: 'Mazos de prueba de diseño — borrar libremente.' },
		{ name: DECK, conf: NEW.COURSES_PRESET.id, desc: 'Una tarjeta por cada tipo de tarjeta de concepto. Borrar tras revisar.' },
	],
	models: [{ ...NEW.CONCEPT_MODEL, fields: [...NEW.CONCEPT_MODEL.fields] }],
	dconfs: [NEW.COURSES_PRESET, NEW.VOCAB_PRESET],
	notes: cards.map((c) => ({
		modelName: NEW.CONCEPT_MODEL.name,
		deck: DECK,
		guid: stableGuid(`cmp-tipos|${c.front}`),
		fields: [c.front, c.back, '12. Transacciones y @Transactional', `<a href="${lessonUrl}">▶ Repasar esta lección</a>`, tipoFieldValue(c.type)],
		tags: c.tags,
	})),
};

const sqlite = await buildCollectionBuffer(spec, await initSqlJs());
const zip = new JSZip();
zip.file('collection.anki2', sqlite);
zip.file('media', '{}');
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const apkg = path.resolve('tmp/type-examples.apkg').replace(/\\/g, '/');
fs.mkdirSync(path.dirname(apkg), { recursive: true });
fs.writeFileSync(apkg, buf);
if (!(await call('deckNames')).includes(DECK)) await call('createDeck', { deck: DECK });
await call('importPackage', { path: apkg });
console.log(`✓ importado: ${DECK} (${cards.length} tarjetas, una por tipo)`);
console.log('Tipos:', cards.map((c) => c.type).join(', '));
