/**
 * Prueba de CONTENIDO del prompt de vocabulario contra el modelo real del
 * proxy local: genera con muse-spark-1.3-contributor-free, parsea y filtra
 * con el CÓDIGO DE PRODUCCIÓN (buildVocabularyPrompt + parseVocabularyPayload
 * + filterVocabulary) y muestra las tarjetas resultantes.
 *
 * Uso: node --import ./scripts/register-ts-resolve.mjs scripts/qa-vocab-ai.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { buildVocabularyPrompt, cefrRank } = await import('../src/shared/prompts.ts');
const {
	DEFAULT_VOCAB_CONFIG,
	parseVocabularyPayload,
	filterVocabulary,
	buildVocabularySpec,
} = await import('../src/app/services/vocabularyService.ts');

const MODEL = process.env.QA_VOCAB_MODEL || 'muse-spark-1.3-contributor-free';
const BASE = process.env.QA_PROXY_BASE || 'http://127.0.0.1:6660/v1';

// Transcripción realista de una lección técnica de Udemy (Java/JVM).
const transcript = [
	'Welcome back everyone. In this lesson we are going to tackle platform dependency, one of the most overlooked pitfalls when teams ship Java applications to production.',
	'Whenever you write code that talks directly to the operating system, you introduce overhead and you leak portability. For instance, if you hard code a file path that works on Windows, the same line will break on a Linux server, and debugging that issue can be a nightmare unless you wrap it behind an abstraction.',
	'The JVM shields us from most of these differences, but it cannot fix careless assumptions. If your library relies on native bindings, you have to ship a binary for each platform, and that burden grows quickly as your audience expands.',
	'A reliable approach is to lean on the standard library whenever possible, and to isolate the remaining bits behind an interface. That way the bulk of your codebase stays portable, and only a thin layer has to be tailored per platform.',
	'Later on we will benchmark both strategies and measure the throughput penalty of each one. Do not worry if this feels overwhelming right now; we will walk through a hands-on example together in the next section, so feel free to pause the video and review the previous lesson if you need to brush up.',
].join(' ');

const course = 'Java In-Depth: Become a Complete Java Engineer! [2026]';
const lesson = '8. Platform Dependency + Demo';

const prompt = buildVocabularyPrompt(transcript, {
	course,
	lesson,
	targetLang: 'inglés',
	baseLang: 'español',
	minLevel: DEFAULT_VOCAB_CONFIG.minLevel,
	maxWords: DEFAULT_VOCAB_CONFIG.maxWords,
});

console.log(`Modelo: ${MODEL}  |  prompt: ${prompt.length} chars`);
const res = await fetch(`${BASE}/chat/completions`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', Authorization: 'Bearer gmifree' },
	body: JSON.stringify({
		model: MODEL,
		messages: [{ role: 'user', content: prompt }],
		temperature: 0.3,
	}),
});
if (!res.ok) {
	console.error(`HTTP ${res.status}:`, (await res.text()).slice(0, 400));
	process.exit(1);
}
const json = await res.json();
const raw = json.choices?.[0]?.message?.content ?? '';
console.log(`respuesta: ${raw.length} chars\n`);

// Parseo + filtro con producción. En producción background.ts hace
// safeJsonParse(raw) y la UI recibe {payload: objeto}; aquí replicamos ese
// paso (fences + primer objeto balanceado).
function safeJsonParseLite(text) {
	const trimmed = String(text || '').trim();
	const fenced = trimmed.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
	const candidates = [trimmed, fenced];
	const match = fenced.match(/\{[\s\S]*\}/);
	if (match) candidates.push(match[0]);
	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);
			if (parsed && typeof parsed === 'object') return parsed;
		} catch { /* siguiente candidato */ }
	}
	return null;
}
const payload = safeJsonParseLite(raw);
if (!payload) {
	console.error('La respuesta no contenía un objeto JSON. Primeros 400 chars:\n', raw.slice(0, 400));
	process.exit(1);
}
const parsed = parseVocabularyPayload(payload);
console.log(`parseadas: ${parsed.length}`);
const { fresh, belowLevel } = filterVocabulary(parsed, DEFAULT_VOCAB_CONFIG);
console.log(`tras filtro ${DEFAULT_VOCAB_CONFIG.minLevel}+: ${fresh.length} (descartadas por nivel: ${belowLevel})\n`);

let failures = 0;
function check(name, condition, detail = '') {
	if (condition) console.log(`  ✓ ${name}`);
	else {
		failures += 1;
		console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

check('JSON válido parseado', parsed.length >= 1);
check('cantidad dentro del tope', fresh.length <= DEFAULT_VOCAB_CONFIG.maxWords);
check('niveles >= B1 (o sin nivel)', fresh.every((w) => cefrRank(w.level) >= cefrRank('B1') || !w.level));
check('lemas en minúsculas sin marcas/JVM', fresh.every((w) => w.word === w.word.toLowerCase() && !/^(java|jvm|windows|linux)$/.test(w.word)));
check('oraciones 6-20 palabras', fresh.every((w) => w.sentence.split(/\s+/).length >= 6 && w.sentence.split(/\s+/).length <= 20));
check('oraciones contienen la palabra', fresh.every((w) => w.sentence.toLowerCase().includes(w.word.split(' ')[0])));
check('traducción presente y distinta del original', fresh.every((w) => w.sentenceTranslation.length > 10 && w.sentenceTranslation !== w.sentence));
check('significado con POS', fresh.every((w) => /^\(\w[\w ]*\)/.test(`(${w.pos}) `)));
check('phonetic generada (IPA o kana)', fresh.every((w) => w.phonetic.length >= 2), JSON.stringify(fresh.filter((w) => w.phonetic.length < 2).map((w) => w.word)));
check('monolingual generada y suficiente', fresh.every((w) => w.monolingual.length >= 10), JSON.stringify(fresh.filter((w) => w.monolingual.length < 10).map((w) => w.word)));
const conLema = fresh.filter((w) => w.monolingual.toLowerCase().includes(w.word.toLowerCase()));
if (conLema.length) console.log(`  · aviso: ${conLema.length} definiciones monolingües contienen el lema (${conLema.map((w) => w.word).join(', ')})`);

const { spec } = buildVocabularySpec(fresh, course, lesson, DEFAULT_VOCAB_CONFIG);
check('spec de vocabulario generada', spec.notes.length === fresh.length && spec.decks[spec.decks.length - 1].name.includes('Vocabulary::English'));

console.log('\n── Tarjetas resultantes ──');
for (const w of fresh) {
	console.log(`\n  [${w.level}] ${w.word} (${w.pos})`);
	console.log(`    EN: ${w.sentence}`);
	console.log(`    ES: ${w.sentenceTranslation}`);
	console.log(`    = ${w.meaning}`);
}

console.log(failures === 0 ? '\n✅ CONTENIDO OK' : `\n❌ ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
