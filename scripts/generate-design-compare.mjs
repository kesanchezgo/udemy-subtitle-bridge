/**
 * Comparación de diseños de tarjeta Anki — ANTERIOR vs NUEVO (Kinema).
 * Genera dos mazos de prueba con el MISMO contenido (1 concepto con código
 * + 1 vocabulario) pero dos diseños de nota, para ver la diferencia en Anki:
 *
 *   Kinema::(prueba) Diseño ANTERIOR
 *   Kinema::(prueba) Diseño NUEVO (Kinema)
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/generate-design-compare.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const JSZip = require('jszip');

const NEW = await import('../src/app/services/ankiDesign.ts');
const OLD = await import('../tmp/ankiDesign-old.ts');
const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');
const { stableGuid } = await import('../src/app/services/ankiDesign.ts');

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

const COURSE = 'Comparación de diseño de tarjetas';
const CONCEPT_DECK = (v) => `Kinema::(prueba) ${v}::Concepto`;
const VOCAB_DECK = (v) => `Kinema::(prueba) ${v}::Vocabulario`;

// ── Contenido IDÉNTICO para ambos diseños ────────────────────────────────────
const conceptCard = {
	front: '¿Qué produce <code>javac</code> a partir del código fuente?',
	back: '<p><b>Bytecode</b> en archivos <code>.class</code>, no código máquina nativo.</p><div class="concept-box">El bytecode es un formato intermedio: solo la JVM puede ejecutarlo.</div>',
	tags: ['java', 'compilacion'],
};
const vocabWord = {
	word: 'pitfall',
	level: 'C1',
	pos: 'noun',
	meaning: 'escollo; trampa oculta; peligro potencial',
	phonetic: '/ˈpɪtfɔːl/',
	monolingual: 'a hidden or unexpected difficulty in a plan or activity',
	sentence: 'Many teams ignore this common pitfall before releasing software to production.',
	sentenceTranslation: 'Muchos equipos ignoran este escollo común antes de lanzar software a producción.',
};

function buildSpec(modelConcept, modelVocab, branchLabel) {
	const cDeck = CONCEPT_DECK(branchLabel);
	const vDeck = VOCAB_DECK(branchLabel);
	return {
		decks: [
			{ name: 'Kinema', conf: NEW.COURSES_PRESET.id, desc: 'Mazos de prueba de diseño — borrar libremente.' },
			{ name: `Kinema::(prueba) ${branchLabel}`, conf: NEW.COURSES_PRESET.id, desc: `Tarjetas con el diseño ${branchLabel}. Borrar tras comparar.` },
			{ name: cDeck, conf: NEW.COURSES_PRESET.id, desc: 'Concepto de prueba.' },
			{ name: vDeck, conf: NEW.VOCAB_PRESET.id, desc: 'Vocabulario de prueba.' },
		],
		models: [modelConcept, modelVocab],
		dconfs: [NEW.COURSES_PRESET, NEW.VOCAB_PRESET],
		notes: [
			{
				modelName: modelConcept.name, deck: cDeck,
				guid: stableGuid(`cmp-${branchLabel}|concepto|${conceptCard.front}`),
				fields: [conceptCard.front, conceptCard.back, '01 · Lección de prueba', '<a href="#">▶ Repasar esta lección</a>', 'concepto'],
				tags: conceptCard.tags,
			},
			{
				modelName: modelVocab.name, deck: vDeck,
				guid: stableGuid(`cmp-${branchLabel}|vocab|${vocabWord.word}`),
				fields: [
					vocabWord.word, vocabWord.phonetic, vocabWord.sentence, vocabWord.sentenceTranslation,
					`(${vocabWord.pos}) ${vocabWord.meaning}`, vocabWord.monolingual, '', '', '',
				],
				tags: ['cefr::c1'],
			},
		],
	};
}

// Modelos clonados con nombre/ID únicos por diseño
function cloneConcept(M, label) {
	return { ...M, name: `UB Concept · ${label}`, id: NEW.stableNumericId(`UB Concept · ${label}`, 1_660_000_000_000), fields: [...M.fields] };
}
function cloneVocab(M, label) {
	return { ...M, name: `UB Vocab · ${label}`, id: NEW.stableNumericId(`UB Vocab · ${label}`, 1_660_000_000_000), fields: [...M.fields] };
}

const variants = [
	{ label: 'Diseño ANTERIOR', concept: cloneConcept(OLD.CONCEPT_MODEL, 'diseño anterior'), vocab: cloneVocab(OLD.buildVocabModel('field'), 'diseño anterior') },
	{ label: 'Diseño NUEVO (Kinema)', concept: cloneConcept(NEW.CONCEPT_MODEL, 'diseño nuevo'), vocab: cloneVocab(NEW.buildVocabModel('field'), 'diseño nuevo') },
];

const SQL = await initSqlJs();
for (const v of variants) {
	const spec = buildSpec(v.concept, v.vocab, v.label);
	const buf = await zipApkg(await buildCollectionBuffer(spec, SQL));
	const apkg = path.resolve(`tmp/design-compare-${v.label.includes('NUEVO') ? 'nuevo' : 'anterior'}.apkg`).replace(/\\/g, '/');
	fs.mkdirSync(path.dirname(apkg), { recursive: true });
	fs.writeFileSync(apkg, buf);
	await call('importPackage', { path: apkg });
	console.log(`  ✓ importado: ${v.label} (${v.concept.name} / ${v.vocab.name})`);
}

console.log('\nAbre en Anki:');
console.log('  Kinema::(prueba) Diseño ANTERIOR       ← diseño que ya conocías');
console.log('  Kinema::(prueba) Diseño NUEVO (Kinema) ← diseño actual');
console.log('Borra ambos mazos cuando termines de comparar.');
