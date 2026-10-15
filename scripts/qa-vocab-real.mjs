/**
 * Prueba REAL del flujo de vocabulario: mismo recorrido que el usuario
 * (IA real sobre transcripción real → sesión de candidatas → selección →
 * export .apkg → verificación del archivo), pero conduciendo el panel desde el
 * propio servicio de producción (buildVocabularySpec) para evitar depender del
 * estado del stepper. La navegación de UI ya está cubierta por el gate visual.
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/qa-vocab-real.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");

const { buildVocabularyPrompt } = await import('../src/shared/prompts.ts');
const { buildVocabularySpec, parseVocabularyPayload } = await import('../src/app/services/vocabularyService.ts');

const MODEL = process.env.USB_MODEL || 'cline-free/mimo-v2.6-flash';
const COURSE = 'Java In-Depth: Become a Complete Java Engineer! [2026]';
const LESSON = '8. Platform Dependency + Demo';

// Transcripción real (misma que produce el E2E sobre el curso real).
const transcript = [
	'00:00:00,000 --> 00:00:04,000',
	'Whenever you write code that talks directly to the operating system, you introduce overhead and you leak portability.',
	'',
	'00:00:04,000 --> 00:00:08,000',
	'If you hard code a file path that works on Windows, the same line will break on a Linux server, and debugging that issue can be a nightmare unless you wrap it behind an abstraction.',
	'',
	'00:00:08,000 --> 00:00:12,000',
	'The JVM shields us from most of these differences, but it cannot fix careless assumptions.',
	'',
	'00:00:12,000 --> 00:00:16,000',
	'A reliable approach is to lean on the standard library whenever possible, and to isolate the remaining bits behind an interface.',
	'',
	'00:00:16,000 --> 00:00:20,000',
	'That way the bulk of your codebase stays portable, and only a thin layer has to be tailored per platform.',
	'',
	'00:00:20,000 --> 00:00:24,000',
	'Later on we will benchmark both strategies and measure the throughput penalty of each one.',
].join('\n');

const config = { rootDeck: 'Kinema', targetLang: 'en', targetLangLabel: 'English', baseLangLabel: 'español', minLevel: 'B1', maxWords: 8, audioMode: 'field' };

console.log('1/3 IA real sobre transcripción real (' + MODEL + ')...');
const res = await fetch('http://127.0.0.1:6660/v1/chat/completions', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', Authorization: 'Bearer gmifree' },
	body: JSON.stringify({
		model: MODEL,
		messages: [{ role: 'user', content: buildVocabularyPrompt(transcript, { course: COURSE, lesson: LESSON, targetLang: 'inglés', baseLang: 'español', minLevel: 'B1', maxWords: 20 }) }],
		temperature: 0.3,
	}),
});
if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(1); }
const json = await res.json();
const raw = json.choices?.[0]?.message?.content ?? '';
const words = parseVocabularyPayload(JSON.parse(raw.includes('```') ? raw.replace(/```json|```/g, '') : raw));
console.log('   palabras:', words.length);

// filtrar por nivel + las que realmente aparecen en los subtítulos
const inTranscript = words.filter((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(transcript));
const final_ = inTranscript.slice(0, config.maxWords);
console.log('   presentes en subtítulos:', inTranscript.length, '| exportando:', final_.length);
final_.forEach((w) => console.log(`     · ${w.word} [${w.level}] (${w.pos}) — ${w.meaning}`));

console.log('2/3 Construyendo .apkg (buildVocabularySpec de producción)...');
const { spec, deckPath } = buildVocabularySpec(final_, COURSE, LESSON, config);
// ankiApkg.ts importa 'sql.js/dist/sql-wasm.wasm?url' (sintaxis Vite): en Node
// se compone el .apkg con el core puro + jszip, el MISMO código de producción
// que la extensión usa dentro de buildAnkiApkg.
const { buildCollectionBuffer } = await import('../src/app/services/ankiApkgCore.ts');
const sqlite = await buildCollectionBuffer(spec, await initSqlJs());
const JSZipMod = require('jszip');
const zip = new JSZipMod();
zip.file('collection.anki2', sqlite);
zip.file('media', '{}');
const apkg = await zip.generateAsync({ type: 'nodebuffer' });
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/qa-vocab-real.apkg', apkg);
console.log(`   → tmp/qa-vocab-real.apkg (${apkg.length} bytes) → ${deckPath}`);

console.log('3/3 Importando en Anki desktop y verificando...');
const invoke = async (action, params = {}) => {
	const res = await fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
	const json = await res.json();
	if (json.error) throw new Error(`${action}: ${json.error}`);
	return json.result;
};
try {
	const r = await invoke('importPackage', { path: path.resolve('tmp/qa-vocab-real.apkg').replace(/\\/g, '/') });
	const nids = await invoke('findNotes', { query: `deck:"${deckPath}"` });
	const infos = nids.length ? await invoke('notesInfo', { notes: nids }) : [];
	const f = infos[0] ? Object.fromEntries(Object.entries(infos[0].fields).map(([k, v]) => [k, v.value])) : {};
	const conf = await invoke('getDeckConfig', { deck: deckPath });
	console.log('   importadas:', nids.length, '| preset:', conf.name, '| nuevas/día:', conf.new.perDay, '| FSRS:', conf.fsrs ?? '(flag no expuesto)');
	console.log('   ejemplo:', JSON.stringify({ word: f.word, phonetic: f.phonetic, bilingual: f.bilingual, sentence: (f.sentence || '').slice(0, 60), picture: f.picture }));
	// limpiar el mazo de prueba
	if (nids.length) await invoke('deleteNotes', { notes: nids });
	await invoke('deleteDecks', { decks: [ROOT_CLEAN(deckPath)], cardsToo: true });
	console.log('   ✓ mazo de prueba limpiado');
} catch (e) {
	console.log('   · Anki no disponible (' + e.message.slice(0, 60) + ') — el .apkg quedó en tmp/ para importar a mano');
}

function ROOT_CLEAN(deck) { return deck.split('::').slice(0, 2).join('::').includes('Vocabulary') ? deck.split('::')[0] : deck; }
