/**
 * Mazos DEMO de alta calidad dejados en el Anki del usuario para revisión.
 * Cubre todos los tipos de tarjeta de conceptos × 3 dominios/objetivos
 * (entrevista Spring Boot senior, hacking ético, Excel) y vocabulario en
 * 2 idiomas (inglés B1+ y japonés) — todo construido con el CÓDIGO DE
 * PRODUCCIÓN (buildConceptSpec / buildVocabularySpec / buildCollectionBuffer)
 * e importado vía AnkiConnect SIN limpieza posterior.
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/qa-anki-samples.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const JSZip = require('jszip');

const { buildConceptSpec, stableGuid } = await import('../src/app/services/ankiDesign.ts');
const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');
const { DEFAULT_VOCAB_CONFIG, buildVocabularySpec } = await import('../src/app/services/vocabularyService.ts');

async function call(action, params = {}) {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
}

async function zipApkg(sqliteData) {
	const zip = new JSZip();
	zip.file('collection.anki2', sqliteData);
	zip.file('media', '{}');
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function exportDeck(spec, file) {
	const buf = await zipApkg(await buildCollectionBuffer(spec, await initSqlJs()));
	const apkgPath = path.resolve(file).replace(/\\/g, '/');
	fs.mkdirSync(path.dirname(apkgPath), { recursive: true });
	fs.writeFileSync(apkgPath, buf);
	await call('importPackage', { path: apkgPath });
	return apkgPath;
}

const ROOT = 'Udemy Bridge';
const url = (c, l) => `https://www.udemy.com/course/demo/learn/lecture/1`;
const cards = (defs) => defs.map((c) => ({ ...c, guid: stableGuid(`${c.course}|${c.lesson}|${c.front}`) }));

// ─────────────────────────────────────────────────────────────────────────────
// 1. SPRING BOOT — objetivo: entrevista senior
// ─────────────────────────────────────────────────────────────────────────────
const SPRING = 'Spring Boot: De Cero a Senior [2026]';
const SPRING_L = '12. Transacciones y @Transactional';

const springCards = [
	{
		course: SPRING, lesson: SPRING_L,
		front: '¿Qué garantiza <code>@Transactional</code> sobre un método de servicio y cuándo hace rollback por defecto?',
		back: `<p>Garantiza que las operaciones del método corren dentro de <b>una única transacción</b>: o todo se confirma (commit) o todo se revierte.</p><p>Por defecto hace rollback solo ante <code>RuntimeException</code> y <code>Error</code>; las excepciones checked <b>no</b> revierten.</p><div class="concept-box">Para revertir con excepciones checked: <code>@Transactional(rollbackFor = Exception.class)</code>.</div>`,
		tags: ['spring', 'transacciones'],
	},
	{
		course: SPRING, lesson: SPRING_L,
		front: `¿Qué imprime el log al ejecutar <code>servicio.procesar()</code> si <code>guardar()</code> lanza <code>RuntimeException</code>?<pre><code class="language-java">@Service
public class Servicio {
    @Transactional
    public void procesar() {
        guardar();  // lanza RuntimeException
        System.out.println("guardado");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void guardar() { /* INSERT */ }
}</code></pre>`,
		back: `<p>No imprime nada: <code>guardar()</code> lanza la excepción y <code>procesar()</code> la propaga sin llegar al <code>println</code>.</p><pre><code class="language-java">// Comportamiento real:
// 1. guardar() abre TX_NUEVA (REQUIRES_NEW)
// 2. RuntimeException marca TX_NUEVA como rollback-only
// 3. procesar() recibe la excepción → su TX exterior también hace rollback</code></pre><div class="warning-box">Como el bean se llama a sí mismo (<b>self-invocation</b>), el proxy de Spring NO aplica <code>REQUIRES_NEW</code>: corre en la misma transacción. Es el fallo clásico de entrevista.</div>`,
		tags: ['spring', 'codigo', 'proxy'],
	},
	{
		course: SPRING, lesson: SPRING_L,
		front: 'Compará <code>Propagation.REQUIRED</code> vs <code>REQUIRES_NEW</code>: ¿cuándo usar cada uno?',
		back: `<table><tr><th></th><th>REQUIRED</th><th>REQUIRES_NEW</th></tr><tr><td>Si ya hay TX</td><td>se une a la existente</td><td>suspende la actual y abre otra</td></tr><tr><td>Rollback del interior</td><td>revierte TODO (misma TX)</td><td>solo revierte la TX nueva</td></tr><tr><td>Uso típico</td><td>la mayoría de operaciones de negocio</td><td>auditoría/logs que deben persistir aunque falle la operación</td></tr></table>`,
		tags: ['spring', 'transacciones'],
	},
	{
		course: SPRING, lesson: SPRING_L,
		front: 'Ordená los pasos para que una prueba de integración quede aislada de la base de datos real.',
		back: `<ol><li>Anotar la prueba con <code>@SpringBootTest</code> + <code>@Transactional</code> (rollback automático al terminar).</li><li>Apuntar a una BD efímera (H2/Testcontainers) con <code>@ActiveProfiles("test")</code>.</li><li>Seed mínimo de datos con <code>@Sql</code> o builders.</li><li>Ejecutar el caso y afirmar sobre el estado dentro de la TX de prueba.</li></ol>`,
		tags: ['spring', 'testing'],
	},
	{
		course: SPRING, lesson: SPRING_L,
		front: 'Entrevista: «¿Por qué @Transactional no funciona cuando un método llama a otro método del mismo bean?»',
		back: `<div class="interview-box"><div class="label">Entrevista</div><ul><li><b>La causa:</b> Spring aplica transaccionalidad con un <b>proxy AOP</b> que envuelve el bean.</li><li>La llamada interna (<code>this.metodo()</code>) salta el proxy: no pasa por el interceptor de transacciones, así que las anotaciones internas se ignoran.</li><li><b>Soluciones:</b> dividir en dos beans, inyectarse a sí mismo (<code>ObjectProvider</code>), o usar <code>TransactionTemplate</code> programático.</li><li><b>Frase de cierre:</b> «la anotación vive en el proxy, no en el objeto: cualquier llamada que no pase por el proxy no es transaccional».</li></ul></div>`,
		tags: ['spring', 'entrevista', 'proxy'],
	},
	{
		course: SPRING, lesson: SPRING_L,
		front: 'Caso real: el email de confirmación se envía aunque la transacción luego hace rollback. ¿Por qué ocurre y cómo lo arreglás?',
		back: `<p>Ocurre porque el envío se ejecuta <b>dentro</b> del método transaccional, antes de saber si hará commit.</p><p>Arreglo: mover el envío a <b>después del commit</b> con <code>TransactionSynchronizationManager.registerSynchronization(afterCommit)</code> o publicando un evento con <code>@TransactionalEventListener(phase = AFTER_COMMIT)</code>.</p><div class="tip-box">Regla de diseño: dentro de la TX solo operaciones transaccionales; efectos secundarios (email, notificaciones, colas) van after-commit.</div>`,
		tags: ['spring', 'diseno'],
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. HACKING ÉTICO — objetivo: formación ofensiva con ética
// ─────────────────────────────────────────────────────────────────────────────
const HACK = 'Hacking Ético: Fundamentos y Recon [2026]';
const HACK_L = '05. Enumeración de servicios con Nmap';

const hackCards = [
	{
		course: HACK, lesson: HACK_L,
		front: '¿Cuál es la diferencia entre el escaneo TCP connect (<code>-sT</code>) y el SYN stealth (<code>-sS</code>)?',
		back: `<p><code>-sT</code> completa el <b>handshake de 3 vías</b> (conexión plena): fiable pero el firewall/daemon lo registra en logs.</p><p><code>-sS</code> envía SYN y responde con RST al SYN-ACK: <b>nunca completa la conexión</b>, por eso es «sigiloso» y más rápido.</p><div class="concept-box">Sin privilegios de root, Nmap cae a <code>-sT</code>; el SYN scan requiere raw sockets.</div>`,
		tags: ['redes', 'nmap'],
	},
	{
		course: HACK, lesson: HACK_L,
		front: `¿Qué comando enumera <b>versiones de servicio</b> en los 1000 puertos más comunes de un objetivo autorizado?<pre><code class="language-bash"># ¿recuerdas las flags de detección?</code></pre>`,
		back: `<pre><code class="language-bash">nmap -sV --top-ports 1000 objetivo.local</code></pre><p><code>-sV</code> interroga cada puerto abierto para deducir <b>servicio, versión y producto</b> (útil para mapear CVEs conocidas).</p><div class="warning-box">Escanea SOLO sistemas propios o con autorización escrita (scope del pentest). Un scan agresivo sin permiso es ilegal en la mayoría de jurisdicciones.</div>`,
		tags: ['nmap', 'recon'],
	},
	{
		course: HACK, lesson: HACK_L,
		front: 'El cliente solo permite pruebas fuera de horario laboral. ¿En qué fase del pentest se define eso y qué documento lo respalda?',
		back: `<p>Se define en la fase de <b>alcance y reglas de compromiso</b> (scoping) del pentest, y se respalda con el <b>documento de autorización / Rules of Engagement</b> firmado.</p><p>Incluye: ventanas de tiempo, IPs en scope, contactos de emergencia y qué pruebas están prohibidas (p. ej. DoS).</p>`,
		tags: ['metodologia', 'etica'],
	},
	{
		course: HACK, lesson: HACK_L,
		front: '¿Por qué un escaneo agresivo (<code>-T4 -A</code>) puede tumbar servicios legacy, y qué haces como profesional si lo sospechas?',
		back: `<p><code>-T4 -A</code> inunda de sondas (scripts NSE, detección de SO, traceroute): servicios antiguos o dispositivos embebidos con pools de conexión pequeños <b>se quedan sin recursos</b> y caen.</p><p>Práctica profesional: empezar sigiloso (<code>-T2</code>), vigilar disponibilidad, y dejar los escaneos agresivos para ventanas acordadas.</p><div class="warning-box">Tumbar un servicio en producción viola las reglas de compromiso: es el límite entre pentest y sabotaje.</div>`,
		tags: ['nmap', 'etica'],
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXCEL — objetivo: análisis de datos (dominio NO de código)
// ─────────────────────────────────────────────────────────────────────────────
const EXCEL = 'Excel para Análisis de Datos [2026]';
const EXCEL_L = '08. BUSCARV, ÍNDICE y COINCIDIR';

const excelCards = [
	{
		course: EXCEL, lesson: EXCEL_L,
		front: 'Compará <b>BUSCARV</b> vs <b>ÍNDICE+COINCIDIR</b>: ¿cuándo conviene cada uno?',
		back: `<table><tr><th></th><th>BUSCARV</th><th>ÍNDICE+COINCIDIR</th></tr><tr><td>Dirección</td><td>solo busca a la derecha de la clave</td><td>cualquier dirección</td></tr><tr><td>Insertar columnas</td><td>rompe el nº de columna</td><td>no se rompe (COINCIDIR recalcula)</td></tr><tr><td>Rendimiento en tablas grandes</td><td>escanea la tabla completa</td><td>un solo vector por coincidencia</td></tr></table>`,
		tags: ['excel', 'busquedas'],
	},
	{
		course: EXCEL, lesson: EXCEL_L,
		front: '¿Qué fórmula devuelve el <b>precio</b> (columna D de <code>Productos</code>) del código que está en <code>A2</code> de la hoja actual?',
		back: `<pre><code class="language-markup">=INDICE(Productos!D:D; COINCIDIR(A2; Productos!A:A; 0))</code></pre><p><code>COINCIDIR(...;0)</code> busca coincidencia <b>exacta</b> y devuelve la posición; <code>INDICE</code> extrae el valor de esa fila en la columna D.</p><div class="tip-box">Con XLOOKUP (Excel 365): <code>=BUSCARX(A2; Productos!A:A; Productos!D:D)</code> — misma idea, menos piezas.</div>`,
		tags: ['excel', 'formulas'],
	},
	{
		course: EXCEL, lesson: EXCEL_L,
		front: 'Ordená los pasos para armar una <b>tabla dinámica</b> de ventas por región y producto.',
		back: `<ol><li>Convertir los datos en una <b>Tabla</b> (Ctrl+T) con encabezados únicos y sin filas vacías.</li><li>Insertar → Tabla dinámica, y elegir dónde colocarla.</li><li>Arrastrar <b>Región</b> y <b>Producto</b> a Filas, <b>Ventas</b> a Valores (Suma).</li><li>Formatear números y agregar segmentadores (slicers) para filtrar rápido.</li><li>Actualizar (Actualizar todo) cuando crezcan los datos de origen.</li></ol>`,
		tags: ['excel', 'tablas-dinamicas'],
	},
	{
		course: EXCEL, lesson: EXCEL_L,
		front: 'Tu jefe quiere ver el <b>top 5 de productos por margen</b> sin escribir fórmulas y que se actualice solo. ¿Qué le propones?',
		back: `<p>Una <b>tabla dinámica</b> con <b>Filtros → Los 10 primeros</b> configurado a 5 por margen, alimentada por la Tabla de origen: se actualiza con «Actualizar todo».</p><div class="concept-box">Alternativa con fórmulas dinámicas (365): <code>=ORDENAR(FILTRAR(...))</code> o TOMAR sobre un orden descendente.</div>`,
		tags: ['excel', 'aplicacion'],
	},
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. VOCABULARIO EN — mismo curso Spring (B1+)
// ─────────────────────────────────────────────────────────────────────────────
const enWords = [
	{ word: 'pitfall', level: 'C1', pos: 'noun', meaning: 'escollo; trampa oculta; peligro potencial', sentence: 'Many teams ignore this common pitfall before releasing software to production.', sentenceTranslation: 'Muchos equipos ignoran este escollo común antes de lanzar software a producción.' },
	{ word: 'overhead', level: 'C1', pos: 'noun', meaning: 'sobrecarga; coste adicional', sentence: 'Adding extra layers always introduces overhead in large distributed systems.', sentenceTranslation: 'Añadir capas adicionales siempre introduce sobrecarga en sistemas distribuidos grandes.' },
	{ word: 'throughput', level: 'C1', pos: 'noun', meaning: 'rendimiento; tasa de transferencia', sentence: 'We measured throughput after optimizing the database queries last week.', sentenceTranslation: 'Medimos el rendimiento después de optimizar las consultas de base de datos la semana pasada.' },
	{ word: 'leak', level: 'B2', pos: 'verb', meaning: 'filtrar; dejar escapar; comprometer', sentence: 'Poor design can leak sensitive details across different system layers.', sentenceTranslation: 'Un mal diseño puede filtrar detalles sensibles entre diferentes capas del sistema.' },
	{ word: 'abstraction', level: 'C1', pos: 'noun', meaning: 'abstracción; simplificación conceptual', sentence: 'A good abstraction hides complex details behind a simple interface.', sentenceTranslation: 'Una buena abstracción oculta detalles complejos tras una interfaz sencilla.' },
	{ word: 'benchmark', level: 'B2', pos: 'verb', meaning: 'evaluar; medir el rendimiento; comparar', sentence: 'We will benchmark both services to compare their response times.', sentenceTranslation: 'Evaluaremos ambos servicios para comparar sus tiempos de respuesta.' },
	{ word: 'brush up', level: 'B2', pos: 'phrasal verb', meaning: 'repasar; refrescar; ponerse al día', sentence: 'I need to brush up on transaction basics before the interview.', sentenceTranslation: 'Necesito repasar los conceptos básicos de transacciones antes de la entrevista.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. VOCABULARIO JA — curso de japonés (JF/CEFR B1+)
// ─────────────────────────────────────────────────────────────────────────────
const JA = 'Japonés para Profesionales: N4 a N3 [2026]';
const JA_L = '07. En la oficina (職場で)';

const jaWords = [
	{ word: '確認', level: 'B1', pos: 'noun', meaning: 'confirmación; verificación; comprobación', sentence: '資料を送る前に内容を確認してください。', sentenceTranslation: 'Por favor, verifique el contenido antes de enviar los documentos.' },
	{ word: '保存', level: 'B1', pos: 'noun', meaning: 'guardado; almacenamiento; conservación', sentence: '作業のあとで必ずファイルを保存してください。', sentenceTranslation: 'Después de trabajar, asegúrese siempre de guardar el archivo.' },
	{ word: '削除', level: 'B2', pos: 'noun', meaning: 'eliminación; borrado', sentence: '間違えた行を削除してください。', sentenceTranslation: 'Por favor, elimine la línea equivocada.' },
	{ word: '経験', level: 'B1', pos: 'noun', meaning: 'experiencia', sentence: 'この仕事には三年の経験が必要です。', sentenceTranslation: 'Este trabajo requiere tres años de experiencia.' },
	{ word: '覚える', level: 'B2', pos: 'verb', meaning: 'memorizar; aprender de memoria; recordar', sentence: '毎日十個の単語を覚えます。', sentenceTranslation: 'Cada día memorizo diez palabras.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Construcción + importación (SE DEJAN en la colección)
// ─────────────────────────────────────────────────────────────────────────────
console.log('══ Construyendo mazos demo (código de producción) ══');
await exportDeck(buildConceptSpec(cards(springCards), SPRING, SPRING_L, ROOT, url()), 'tmp/samples/spring.apkg');
console.log(`  ✓ ${SPRING}::${SPRING_L} — ${springCards.length} tarjetas (concepto, código, comparación, proceso, entrevista, aplicación)`);
await exportDeck(buildConceptSpec(cards(hackCards), HACK, HACK_L, ROOT, url()), 'tmp/samples/hacking.apkg');
console.log(`  ✓ ${HACK}::${HACK_L} — ${hackCards.length} tarjetas`);
await exportDeck(buildConceptSpec(cards(excelCards), EXCEL, EXCEL_L, ROOT, url()), 'tmp/samples/excel.apkg');
console.log(`  ✓ ${EXCEL}::${EXCEL_L} — ${excelCards.length} tarjetas`);

const enCfg = { ...DEFAULT_VOCAB_CONFIG, minLevel: 'B1' };
const { spec: enSpec } = buildVocabularySpec(enWords, SPRING, SPRING_L, enCfg);
await exportDeck(enSpec, 'tmp/samples/vocab-en.apkg');
console.log(`  ✓ Vocabulary::English::${SPRING} — ${enWords.length} palabras B1+`);

const jaCfg = { ...DEFAULT_VOCAB_CONFIG, targetLang: 'ja', targetLangLabel: 'Japanese', minLevel: 'B1' };
const { spec: jaSpec } = buildVocabularySpec(jaWords, JA, JA_L, jaCfg);
await exportDeck(jaSpec, 'tmp/samples/vocab-ja.apkg');
console.log(`  ✓ Vocabulary::Japanese::${JA} — ${jaWords.length} palabras B1+`);

// Resumen de la colección
const decks = (await call('deckNames')).filter((d) => d === ROOT || d.startsWith(`${ROOT}::`)).sort();
console.log('\n══ Árbol dejado en Anki ══');
for (const d of decks) {
	const n = await call('findNotes', { query: `deck:"${d}"` });
	console.log(`  ${d}${n.length ? `  (${n.length} notas)` : ''}`);
}
console.log('\n✅ Mazos demo importados y DEJADOS para revisión');
