/**
 * Prueba REAL en Anki: .apkg de CONCEPTOS y de VOCABULARIO importados con el
 * build final, verificando:
 *   A. Conceptos → Kinema::Courses::‹curso›::‹lección›, 5 campos (Front, Back,
 *      Leccion, Fuente, Tipo), píldora de tipo, GUIDs únicos.
 *   B. Vocabulario → Kinema::Vocabulary::English::‹curso›, 9 campos tipo
 *      "English Cards".
 *   C. Presets visibles «Kinema · Cursos» / «Kinema · Vocabulario» con IDs
 *      estables (no duplican los «Udemy Bridge …» ya importados).
 *   D. Default del usuario intacto.
 *   E. Historial: lección sin descargar aparece como pendiente (markExported
 *      solo tras exportar).
 *
 * Uso: node scripts/qa-anki-both-decks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZipMod from 'jszip';
import initSqlJsMod from 'sql.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = JSZipMod.default ?? JSZipMod;
const initSqlJs = initSqlJsMod.default ?? initSqlJsMod;

const { COURSES_PRESET, VOCAB_PRESET, conceptDeckPath, vocabDeckPath, sanitizeDeckSegment } = await import('../src/app/services/ankiDesign.ts');
const { buildVocabularySpec } = await import('../src/app/services/vocabularyService.ts');

const COURSE = 'QA Integración Final';
const LESSON = '01. Lección QA';
const ISSUE = '02. Lección QA';
const ROOT = 'Kinema';

const invoke = async (action, params = {}) => {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
};

let failures = 0;
const check = (name, ok, detail = '') => {
	if (ok) console.log('  ✓', name);
	else { failures += 1; console.error('  ✗', name, detail ? '— ' + detail : ''); }
};

// ── construir los dos .apkg con el código de producción ──────────────────────
const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');
const SQL = await initSqlJs();

const lessonUrl = 'https://www.udemy.com/course/qa/learn/lecture/1';
const { buildConceptSpec } = await import('../src/app/services/ankiDesign.ts');
const conceptSpec = buildConceptSpec(
	[
		{ front: '¿Qué produce <code>javac</code>?', back: '<p><b>Bytecode</b> en <code>.class</code>.</p>', guid: 'usbqac1', tags: ['java'] },
		{ front: 'REQUIRED vs REQUIRES_NEW', back: '<table><tr><th></th><th>REQUIRED</th><th>REQUIRES_NEW</th></tr></table>', guid: 'usbqac2', tags: ['java'] },
		{ front: 'Aísla la prueba de integración', back: '<ol><li>@SpringBootTest</li></ol>', guid: 'usbqac3', tags: ['testing'] },
	].map((c) => ({ ...c, type: ['concepto', 'comparacion', 'proceso'][c.guid === 'usbqac1' ? 0 : c.guid === 'usbqac2' ? 1 : 2] })),
	COURSE, LESSON, ROOT, lessonUrl,
);
const vocabWords = [
	{ word: 'overhead', level: 'B2', pos: 'noun', meaning: 'sobrecarga; coste adicional', phonetic: '/ˈoʊvərhɛd/', monolingual: 'extra work or resources needed beyond the main task', sentence: 'The new library adds overhead to every request.', sentenceTranslation: 'La nueva biblioteca añade sobrecarga a cada solicitud.' },
	{ word: 'isolate', level: 'B2', pos: 'verb', meaning: 'aislar; separar del resto', phonetic: '/ˈaɪsəleɪt/', monolingual: 'to separate something from others', sentence: 'We isolate the failing test from the rest.', sentenceTranslation: 'Aislamos la prueba que falla del resto.' },
];
const { spec: vocabSpec } = buildVocabularySpec(vocabWords, COURSE, ISSUE, {
	rootDeck: ROOT, targetLang: 'en', targetLangLabel: 'English', baseLangLabel: 'español', minLevel: 'B1', maxWords: 8, audioMode: 'field',
});

async function toApkg(spec) {
	const zip = new JSZip();
	zip.file('collection.anki2', await buildCollectionBuffer(spec, SQL));
	zip.file('media', '{}');
	return zip.generateAsync({ type: 'nodebuffer' });
}

fs.mkdirSync('tmp', { recursive: true });
const conceptApkg = await toApkg(conceptSpec);
const vocabApkg = await toApkg(vocabSpec);
fs.writeFileSync('tmp/qa-both-concept.apkg', conceptApkg);
fs.writeFileSync('tmp/qa-both-vocab.apkg', vocabApkg);

const lessonDeck = conceptDeckPath(ROOT, COURSE, LESSON);
const vocabDeck = vocabDeckPath(ROOT, 'English', COURSE)[3];

// ── A. estado previo ─────────────────────────────────────────────────────────
console.log('\nA. Estado previo de la colección');
const beforeDecks = (await invoke('deckNames')).sort();
const defaultBefore = await invoke('getDeckConfig', { deck: 'Default' });
console.log(`   mazos: ${beforeDecks.length} | Default perDay: ${defaultBefore.new.perDay}`);

// ── B. importar ambos ────────────────────────────────────────────────────────
console.log('\nB. Importando .apkg de conceptos y vocabulario');
await invoke('importPackage', { path: path.resolve('tmp/qa-both-concept.apkg').replace(/\\/g, '/') });
await invoke('importPackage', { path: path.resolve('tmp/qa-both-vocab.apkg').replace(/\\/g, '/') });
console.log('   importados');

// ── C. verificar estructura ───────────────────────────────────────────────────
console.log('\nC. Estructura en Anki');
const conceptNotes = await invoke('findNotes', { query: `deck:"${lessonDeck}"` });
check('conceptos en Kinema::Courses::‹curso›::‹lección›', conceptNotes.length === 3, String(conceptNotes.length));
const cInfo = (await invoke('notesInfo', { notes: conceptNotes }))[0];
const cFields = Object.keys(cInfo.fields);
check('5 campos (Front, Back, Leccion, Fuente, Tipo)',
	JSON.stringify(cFields) === JSON.stringify(['Front', 'Back', 'Leccion', 'Fuente', 'Tipo']), cFields.join(','));
const cFirst = conceptNotes.find((_n, i) => cInfo.fields.Tipo && i === 0);
const tipoValue = cInfo.fields.Tipo?.value ?? '';
check('campo Tipo relleno con data-tp (píldora coloreada)', /data-tp="/.test(tipoValue), tipoValue.slice(0, 60));
const guids = (await invoke('notesInfo', { notes: conceptNotes })).map((n) => n.noteId);
check('notas únicas (GUIDs por contenido)', new Set(guids).size === guids.length);

const vocabNotes = await invoke('findNotes', { query: `deck:"${vocabDeck}"` });
check('vocabulario en Kinema::Vocabulary::English::‹curso›', vocabNotes.length === 2, String(vocabNotes.length));
const vInfo = (await invoke('notesInfo', { notes: vocabNotes }))[0];
const vFields = Object.keys(vInfo.fields);
check('9 campos (word…word audio)', vFields.length === 9 && vFields[0] === 'word' && vFields[8] === 'word audio', vFields.join(','));

// ── D. presets visibles e IDs estables ───────────────────────────────────────
console.log('\nD. Presets visibles');
const cConf = await invoke('getDeckConfig', { deck: lessonDeck });
const vConf = await invoke('getDeckConfig', { deck: vocabDeck });
check('preset de Cursos visible como «Kinema · Cursos»', cConf.name === 'Kinema · Cursos', cConf.name);
check('preset de Vocabulario visible como «Kinema · Vocabulario»', vConf.name === 'Kinema · Vocabulario', vConf.name);
check('IDs congelados (no duplican ni cambian)', cConf.id === COURSES_PRESET.id && vConf.id === VOCAB_PRESET.id, `cursos ${cConf.id} vs ${COURSES_PRESET.id}`);
check('20 nuevas/día (Cursos) y 15/día (Vocabulario)', cConf.new.perDay === 20 && vConf.new.perDay === 15);
check('FSRS activo en ambos presets', cConf.fsrs === true && vConf.fsrs === true, `cursos ${cConf.fsrs}`);
// ¿existen presets duplicados con el nombre viejo? AnkiConnect no lista
// presets, así que se detecta por decks que sigan apuntando a ellos.
let legacyBacked = [];
for (const deckName of await invoke('deckNames')) {
	const conf = await invoke('getDeckConfig', { deck: deckName }).catch(() => null);
	if (conf && /Udemy Bridge · /.test(conf.name)) legacyBacked.push(`${deckName} → ${conf.name}`);
}
check('sin presets «Udemy Bridge ·» duplicados', legacyBacked.length === 0, JSON.stringify(legacyBacked));

const defaultAfter = await invoke('getDeckConfig', { deck: 'Default' });
check('preset Default del usuario intacto', defaultAfter.new.perDay === defaultBefore.new.perDay && defaultAfter.id === 1);

// ── E. historial: lección sin exportar = pendiente ──────────────────────────
console.log('\nE. Historial (pendiente vs exportado)');
// El Historial vive en el servicio: pendiente = lección completada sin
// exportedAt. historyService espera localStorage; en Node se inyecta un store
// en memoria para ejercitar el MISMO código que corre en la extensión.
const memStore = new Map();
globalThis.localStorage = {
	getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
	setItem: (k, v) => { memStore.set(k, String(v)); },
	removeItem: (k) => { memStore.delete(k); },
	clear: () => memStore.clear(),
	key: (i) => [...memStore.keys()][i] ?? null,
	get length() { return memStore.size; },
};
const { historyService } = await import('../src/app/services/historyService.ts');
const qaCards = [{ id: 'c1', front: 'pregunta de prueba', back: 'respuesta', tags: ['qa'], type: 'concepto' }];
const pendingLecture = await historyService.upsertLecture({
	courseId: 'qa-int', lectureId: 'lesson-pending',
	courseName: COURSE, lectureName: 'Pendiente QA',
	status: 'completed', ankiCards: qaCards, ankiCardsCount: qaCards.length,
	questionsComplete: true, questions: [],
});
await historyService.upsertLecture({
	courseId: 'qa-int', lectureId: 'lesson-exported',
	courseName: COURSE, lectureName: 'Exportada QA',
	status: 'completed', ankiCards: qaCards, ankiCardsCount: qaCards.length,
	questionsComplete: true, questions: [],
});
check('pendiente = completada sin exportedAt', pendingLecture.exportedAt === undefined);
await historyService.markExported('qa-int', 'lesson-exported');
const exportedRec = await historyService.getLecture('qa-int', 'lesson-exported');
const pendingRec = await historyService.getLecture('qa-int', 'lesson-pending');
check('marcar exportado mueve la lección a «fijada»',
	Boolean(exportedRec?.exportedAt) && pendingRec?.exportedAt === undefined,
	`exported=${Boolean(exportedRec?.exportedAt)} pending=${pendingRec?.exportedAt}`);
// limpieza del historial de prueba
await historyService.deleteLecture('qa-int', 'lesson-pending');
await historyService.deleteLecture('qa-int', 'lesson-exported');

// ── limpieza de mazos y notas de prueba ──────────────────────────────────────
for (const deck of [lessonDeck, vocabDeck]) {
	const ids = await invoke('findNotes', { query: `deck:"${deck}"` });
	if (ids.length) await invoke('deleteNotes', { notes: ids });
	await invoke('deleteDecks', { decks: [deck], cardsToo: true });
}
// limpiar también los mazos padre que Anki deja al borrar los hijos
await invoke('deleteDecks', { decks: [`${ROOT}::Courses`, `${ROOT}::Courses::${COURSE}`, `${ROOT}::Vocabulary`, `${ROOT}::Vocabulary::English`, `${ROOT}::Vocabulary::English::${COURSE}`, ROOT], cardsToo: true }).catch(() => {});
const finalDecks = (await invoke('deckNames')).sort();
const expectedFinal = beforeDecks.filter((d) => d !== ROOT && !d.startsWith(`${ROOT}::`)).sort();
check('colección igual al estado previo',
	JSON.stringify(finalDecks) === JSON.stringify(expectedFinal),
	`${finalDecks.length} vs ${expectedFinal.length}`);

console.log(failures === 0 ? '\n✅ VERIFICACIÓN FINAL OK' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
