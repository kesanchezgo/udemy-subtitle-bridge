/**
 * QA estructural de los .apkg de la extensión — ejercita el CÓDIGO DE
 * PRODUCCIÓN real (ankiDesign / ankiApkgCore / vocabularyService / prompts)
 * desde Node con un resolve hook, y verifica el contenido de la colección
 * SQLite resultante:
 *
 *   1. Conceptos: árbol <Root>::Courses::<Curso>::<Lección>, note type con
 *      campos Front/Back/Leccion/Fuente, ambos presets embebidos, csum SHA-1
 *      compatible con Anki, GUID estable por contenido.
 *   2. Vocabulario: campos idénticos a "English Cards" (pipeline de imágenes
 *      compatible), filtro CEFR, tope por lección, GUID por (idioma|lema).
 *
 * Salidas: tmp/qa-concept.apkg y tmp/qa-vocab.apkg para la prueba de
 * importación real en Anki Desktop (scripts/qa-anki-import-verify.mjs).
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/qa-anki-decks.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

// El hook de resolución (.ts para imports sin extensión) lo registra
// scripts/register-ts-resolve.mjs vía `node --import`. Los imports de src/
// van con import dinámico para ejecutarse DESPUÉS del registro.

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const JSZip = require('jszip');

const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');
const {
	CONCEPT_MODEL,
	COURSES_PRESET,
	VOCAB_PRESET,
	DEFAULT_ROOT_DECK,
	buildConceptSpec,
	sanitizeDeckSegment,
	stableGuid,
} = await import('../src/app/services/ankiDesign.ts');
const {
	DEFAULT_VOCAB_CONFIG,
	buildVocabularySpec,
	filterVocabulary,
	parseVocabularyPayload,
	splitAlreadyExported,
} = await import('../src/app/services/vocabularyService.ts');
const { buildVocabularyPrompt, cefrRank } = await import('../src/shared/prompts.ts');

const ROOT = process.env.QA_ROOT_DECK || DEFAULT_ROOT_DECK;
const COURSE = 'USB QA — Curso de Prueba';
const LESSON = '01 — Lección de Prueba';

let failures = 0;
function check(name, condition, detail = '') {
	if (condition) {
		console.log(`  ✓ ${name}`);
	} else {
		failures += 1;
		console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

async function zipApkg(sqliteData) {
	const zip = new JSZip();
	zip.file('collection.anki2', sqliteData);
	zip.file('media', '{}');
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function openCollection(apkgBuffer) {
	const zip = await JSZip.loadAsync(apkgBuffer);
	const anki2 = await zip.file('collection.anki2').async('nodebuffer');
	const SQL = await initSqlJs();
	const db = new SQL.Database(anki2);
	const one = (sql) => {
		const stmt = db.prepare(sql);
		stmt.step();
		const row = stmt.get();
		stmt.free();
		return row;
	};
	const col = JSON.parse(one('SELECT conf FROM col')[0]);
	const models = JSON.parse(one('SELECT models FROM col')[0]);
	const decks = JSON.parse(one('SELECT decks FROM col')[0]);
	const dconf = JSON.parse(one('SELECT dconf FROM col')[0]);
	const all = (sql) => {
		const stmt = db.prepare(sql);
		const rows = [];
		while (stmt.step()) rows.push(stmt.getAsObject());
		stmt.free();
		return rows;
	};
	const notes = all('SELECT * FROM notes ORDER BY id');
	const cards = all('SELECT * FROM cards ORDER BY id');
	return { db, col, models, decks, dconf, notes, cards };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONCEPTOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══ 1. Conceptos (.apkg) ══');

const conceptCards = [
	{
		front: '¿Qué produce <code>javac</code> a partir del código fuente?',
		back: '<p><b>Bytecode</b> en archivos <code>.class</code>, no código máquina nativo.</p>',
		guid: '',
		tags: ['java', 'compilacion', 'Tag Con Espacios'],
	},
	{
		front: '¿Por qué el mismo <code>.class</code> corre en Windows y Linux?',
		back: '<p>La <b>JVM</b> de cada plataforma interpreta el mismo bytecode.</p>',
		guid: '',
		tags: [],
	},
	{
		front: 'Papel del JIT',
		back: '<p>Compila <b>hot spots</b> a nativo en caliente.</p>',
		guid: '',
		tags: ['java'],
	},
];

const lessonUrl = 'https://www.udemy.com/course/usb-qa/learn/lecture/1';
const conceptSpec = buildConceptSpec(
	conceptCards.map((c) => ({ ...c, guid: stableGuid(`${COURSE}|${LESSON}|${c.front}`) })),
	COURSE,
	LESSON,
	ROOT,
	lessonUrl,
);
const conceptApkg = await zipApkg(await buildCollectionBuffer(conceptSpec, await initSqlJs()));
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/qa-concept.apkg', conceptApkg);
console.log(`  → tmp/qa-concept.apkg (${conceptApkg.length} bytes)`);

{
	const col = await openCollection(conceptApkg);
	const lessonPath = [ROOT, 'Courses', sanitizeDeckSegment(COURSE), sanitizeDeckSegment(LESSON)].join('::');
	const deckNames = Object.values(col.decks).map((d) => d.name);
	check('árbol completo de mazos (raíz, Courses, curso, lección)', deckNames.length === 4
		&& deckNames.includes(ROOT)
		&& deckNames.includes(`${ROOT}::Courses`)
		&& deckNames.includes(lessonPath), JSON.stringify(deckNames));
	const lessonDeck = Object.values(col.decks).find((d) => d.name === lessonPath);
	check('mazo de lección apunta al preset de Cursos', lessonDeck?.conf === COURSES_PRESET.id);
	const rootDeck = Object.values(col.decks).find((d) => d.name === ROOT);
	check('raíz con descripción de la extensión', Boolean(rootDeck?.desc?.includes('Kinema')));

	const model = col.models[String(CONCEPT_MODEL.id)];
	check('note type "Udemy Bridge Concept" embebido', model?.name === 'Udemy Bridge Concept');
	check('campos Front/Back/Leccion/Fuente', JSON.stringify(model?.flds?.map((f) => f.name)) === '["Front","Back","Leccion","Fuente"]');
	check('plantilla usa {{Leccion}} en la píldora', model?.tmpls?.[0]?.qfmt.includes('{{Leccion}}'));
	check('plantilla usa {{Fuente}} en el reverso', model?.tmpls?.[0]?.afmt.includes('{{#Fuente}}'));

	const conf = col.dconf[String(COURSES_PRESET.id)];
	check('preset "Udemy Bridge · Cursos" embebido', conf?.name === COURSES_PRESET.name);
	check('preset: 20 nuevas/día, pasos [1,10]', conf?.new?.perDay === 20 && JSON.stringify(conf?.new?.delays) === '[1,10]');
	check('preset: lapso 30% + leech con tag', conf?.lapse?.mult === 0.3 && conf?.lapse?.leechAction === 1);
	check('preset: NO es el id 1 (Default del usuario)', COURSES_PRESET.id !== 1 && VOCAB_PRESET.id !== 1);
	check('preset vocabulario también incluido', Boolean(col.dconf[String(VOCAB_PRESET.id)]) && col.dconf[String(VOCAB_PRESET.id)].new.perDay === 15);

	check('3 notas insertadas', col.notes.length === 3);
	check('3 tarjetas, ord 0, type new', col.cards.length === 3 && col.cards.every((c) => c.ord === 0 && c.type === 0 && c.queue === 0));
	const note = col.notes[0];
	const fields = note.flds.split('\x1f');
	check('nota con 4 campos y Fuente con enlace a la lección', fields.length === 4 && fields[3].includes(lessonUrl));
	check('tags sanitizadas (espacios → guiones)', note.tags === 'java compilacion Tag-Con-Espacios', note.tags);
	check('GUID usb* por contenido', /^usb[a-z0-9]{4,8}$/.test(note.guid), note.guid);

	// csum == primeros 8 hex de SHA-1 del sfld (como Anki)
	const sfld = fields[0].replace(/<[^>]+>/g, '').trim();
	const expected = parseInt(crypto.createHash('sha1').update(Buffer.from(sfld, 'utf8')).digest('hex').slice(0, 8), 16);
	check('csum = SHA-1 estándar de Anki', note.csum === expected, `nota ${note.csum} vs ${expected}`);
	check('sfld = Front sin HTML', sfld === '¿Qué produce javac a partir del código fuente?', sfld);

	const spec2 = buildConceptSpec(
		conceptCards.map((c) => ({ ...c, guid: stableGuid(`${COURSE}|${LESSON}|${c.front}`) })),
		COURSE, LESSON, ROOT, lessonUrl,
	);
	check('GUID determinista (reexport = misma nota)', spec2.notes[0].guid === conceptSpec.notes[0].guid);
	col.db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. VOCABULARIO
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══ 2. Vocabulario (.apkg) ══');

const mockAiPayload = {
	words: [
		// Palabras exclusivas del fixture: no deben colisionar con los mazos
		// demo reales de la colección (el dedup por GUID es de TODA la
		// colección y movería/actualizaría notas existentes).
		{ word: 'Bottleneck', level: 'B2', pos: 'noun', meaning: 'cuello de botella; restricción', sentence: 'The slow disk is the main bottleneck in the pipeline.', sentenceTranslation: 'El disco lento es el principal cuello de botella del pipeline.', phonetic: '/ˈbɑːtəlnek/', monolingual: 'a stage that limits the speed of a whole process' },
		{ word: 'trade-off', level: 'B2', pos: 'noun', meaning: 'contrapartida; equilibrio entre ventajas', sentence: 'Every caching strategy is a trade-off between speed and freshness.', sentenceTranslation: 'Toda estrategia de caché es un equilibrio entre velocidad y frescura.', phonetic: '/ˈtreɪd ɔːf/', monolingual: 'a balance between two opposing advantages' },
		{ word: 'usbfixture', level: 'B1', pos: 'phrasal verb', meaning: 'terminar; concluir', sentence: 'Let us usbfixture this section with a quick summary.', sentenceTranslation: 'Cerremos esta sección con un resumen rápido.', phonetic: '/ˈfɪkstʃər/', monolingual: 'to finish or complete something' },
		{ word: 'house', level: 'A1', pos: 'noun', meaning: 'casa', sentence: 'The house is big.', sentenceTranslation: 'La casa es grande.', phonetic: '/haʊs/', monolingual: 'a building where people live' },
		{ word: 'usbfixture', level: 'B2', pos: 'verb', meaning: 'fugar', sentence: 'Duplicate lemma should be dropped.', sentenceTranslation: 'El lema duplicado debe descartarse.', phonetic: '/ˈfɪkstʃər/', monolingual: 'to let something escape' },
		// tolerancia: palabra SIN phonetic/monolingual (respuesta parcial de un modelo)
		{ word: 'latency', level: 'C1', pos: 'noun', meaning: 'latencia; retraso', sentence: 'Network latency hurts real-time applications the most.', sentenceTranslation: 'La latencia de red perjudica más a las aplicaciones en tiempo real.' },
	],
};

const parsed = parseVocabularyPayload(mockAiPayload);
check('payload tolerante: 6 candidatos parseados', parsed.length === 6, `got ${parsed.length}`);
check('tolerancia: palabra sin phonetic/monolingual se parsea', parsed.every((w) => w.sentence && w.meaning) && parsed.some((w) => !w.phonetic));
const { fresh: levelFiltered, belowLevel } = filterVocabulary(parsed, DEFAULT_VOCAB_CONFIG);
check('filtro CEFR: A1 descartada', belowLevel === 1 && levelFiltered.length === 4, `below=${belowLevel} fresh=${levelFiltered.length}`);
check('filtro CEFR: lema duplicado descartado', levelFiltered.every((w) => w.word !== 'usbfixture' || !levelFiltered.some((o) => o !== w && o.word === 'usbfixture')));
check('normalización de lema (minúsculas)', levelFiltered[0].word === 'bottleneck');

const { fresh: freshWords, seen } = splitAlreadyExported(levelFiltered, {}, DEFAULT_VOCAB_CONFIG.targetLang);
check('registro vacío: nada marcado como visto', freshWords.length === 4 && seen.length === 0);

const vocabPrompt = buildVocabularyPrompt('Transcripción de ejemplo con enough words to extract vocabulary from this lesson transcript.', {
	course: COURSE, lesson: LESSON, targetLang: 'inglés', baseLang: 'español', minLevel: 'B1', maxWords: 8,
});
check('prompt exige lema/minúsculas y prohíbe subtítulo crudo', vocabPrompt.includes('forma base (lema)') && vocabPrompt.includes('PROHIBIDO copiar la línea del subtítulo'));
check('prompt inyecta nivel y tope', vocabPrompt.includes('NIVEL MÍNIMO (CEFR, incluido): B1') && vocabPrompt.includes('MÁXIMO DE PALABRAS: 8'));

const { spec: vocabSpec, deckPath } = buildVocabularySpec(freshWords, COURSE, LESSON, DEFAULT_VOCAB_CONFIG);
check('mazo destino = Root::Vocabulary::English::Curso', deckPath === `${ROOT}::Vocabulary::English::${sanitizeDeckSegment(COURSE)}`, deckPath);
const vocabApkg = await zipApkg(await buildCollectionBuffer(vocabSpec, await initSqlJs()));
fs.writeFileSync('tmp/qa-vocab.apkg', vocabApkg);
console.log(`  → tmp/qa-vocab.apkg (${vocabApkg.length} bytes)`);

{
	const col = await openCollection(vocabApkg);
	const vocabModel = Object.values(col.models).find((m) => m.name === 'Udemy Bridge Vocab');
	check('note type "Udemy Bridge Vocab" embebido', Boolean(vocabModel));
	const fieldNames = vocabModel?.flds?.map((f) => f.name) ?? [];
	check('campos IDÉNTICOS a "English Cards" (pipeline de imágenes)', JSON.stringify(fieldNames) === JSON.stringify([
		'word', 'phonetic', 'sentence', 'translation', 'bilingual', 'monolingual', 'picture', 'sentence audio', 'word audio',
	]), JSON.stringify(fieldNames));
	check('plantilla front con hero + cloze de contexto', vocabModel?.tmpls?.[0]?.qfmt.includes('front-word-hero') && vocabModel?.tmpls?.[0]?.qfmt.includes('cloze-gap'));

	const note = col.notes[0];
	const fields = note.flds.split('\x1f');
	check('campos de texto completos (word, phonetic, sentence, translation, bilingual, monolingual)', fields[0] === 'bottleneck'
		&& fields[1].length > 3
		&& fields[2].length > 10
		&& fields[3].length > 10
		&& fields[4].startsWith('(noun)')
		&& fields[5].length > 10
		&& fields[6] === '' && fields[7] === '' && fields[8] === '');
	check('tags con curso/lección/cefr jerárquicos', note.tags.includes('curso::usb-qa-curso-de-prueba') && note.tags.includes('cefr::b2'), note.tags);
	check('GUID por (idioma|lema)', note.guid === stableGuid(`usb-vocab|en|bottleneck`));

	const langDeck = Object.values(col.decks).find((d) => d.name === `${ROOT}::Vocabulary::English`);
	check('mazo de idioma apunta al preset de Vocabulario', langDeck?.conf === VOCAB_PRESET.id);
	const sfld = fields[0];
	const expected = parseInt(crypto.createHash('sha1').update(Buffer.from(sfld, 'utf8')).digest('hex').slice(0, 8), 16);
	check('csum SHA-1 sobre el campo word', note.csum === expected);

	// GUID estable ante reexport del mismo lema en otra lección (misma palabra → misma nota)
	const { spec: spec2 } = buildVocabularySpec(freshWords, COURSE, '02 — Otra Lección', DEFAULT_VOCAB_CONFIG);
	check('reexport en otra lección conserva GUID (update, no duplicado)', spec2.notes[0].guid === note.guid);
	col.db.close();
}

console.log(failures === 0 ? '\n✅ TODO OK' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
