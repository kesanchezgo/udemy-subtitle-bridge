// Tests puros de la fase 4 (duplicados de conceptos contra el mazo): identidad
// sin similitud léxica, el mazo desde el historial y desde Anki, qué viaja al
// prompt, qué se marca «ya en tu mazo», cobertura, «Repasar hoy en Anki» con un
// Anki simulado (qué búsqueda se usa y que las nuevas no se tocan), Biblioteca
// y nota de Obsidian.
// node scripts/qa-deck-units.mjs   (Node ≥ 22.18: importa .ts directamente)
import assert from "node:assert/strict";

const root = new URL("../src/", import.meta.url);
const load = (p) => import(new URL(p, root).href);
const deck = await load("app/services/deckConcepts.ts");
const cov = await load("app/services/cardCoverage.ts");
const ops = await load("app/services/ankiConnectOps.ts");
const prompts = await load("shared/prompts.ts");
const dest = await load("app/services/ankiDestination.ts");
const design = await load("app/services/ankiDesign.ts");
const lib = await load("app/services/library.ts");
const obs = await load("app/services/obsidianExport.ts");

let passed = 0;
const test = async (name, fn) => {
	try { await fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}`); throw error; }
};

const COURSE = "Java In-Depth: Become a Complete Java Engineer!";
const ARCH = "Arquitectura de la JVM";
const JIT = "JIT y rendimiento en caliente";
const scopeOf = (lesson, extra = {}) => ({ course: COURSE, lesson, ...extra });
const archRecord = (extra = {}) => ({
	courseName: COURSE, lectureName: ARCH, exportedAt: 1000,
	studyContent: {
		keyConcepts: [
			"Qué es un hot spot — un método que se ejecuta tantas veces que el JIT lo compila",
			"Para qué sirve el warm-up — la JVM ejecuta un rato antes de que el JIT optimice",
			"Qué guarda el heap — los objetos creados con new viven en el heap",
		],
		conceptTerms: ["JIT", "heap"],
	},
	ankiCards: [
		{ id: "card-001", front: "¿Qué es un <em>hot spot</em> para el JIT?", conceptRefs: [0] },
		{ id: "card-002", front: "¿Por qué una app Java va más rápida tras unos minutos (warm-up)?", conceptRefs: [1] },
		{ id: "card-003", front: "¿Dónde viven los objetos creados con <code>new</code>?", conceptRefs: [2] },
	],
	...extra,
});

// La implementación ANTERIOR de stableAnkiGuid (StudyAgentTab), copiada tal cual:
// el GUID no puede cambiar (reimportar duplicaría todo).
const legacyGuid = (course, lesson, card) => {
	const seg = (s) => String(s || "").replace(/::/g, " — ").replace(/"/g, "'").replace(/[\u0000-\u001f]/g, " ").trim();
	const extra = String(card.id ?? "").startsWith("study-cobertura-") || String(card.id ?? "").startsWith("study-refuerzo-");
	const source = `${seg(course)}|${seg(lesson)}|${card.doubt ? "duda:" : extra ? "study:" : ""}${card.front}`;
	let hash = 2166136261;
	for (let i = 0; i < source.length; i += 1) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
	return `usb${hash.toString(36)}`;
};

await test("Identidad: texto plano, código del frente, título de idea; el GUID no cambia", () => {
	assert.equal(deck.plainText("<p>¿Qué hace <code>javac</code> &amp; la <b>JVM</b>?</p>"), "¿Qué hace javac & la JVM?");
	assert.deepEqual(deck.codeTerms("¿Qué hace <code>javac</code>? <pre><code>java App</code></pre> <code>new</code>"), ["javac", "new"], "el código en bloque no es un nombre canónico");
	assert.equal(deck.ideaTitleKey("Qué es un hot spot — un método…"), "queesunhotspot");
	assert.equal(deck.ideaTitleKey("Usos — para qué sirve"), "", "un título corto no identifica una idea");
	for (const card of [{ id: "card-001", front: "¿A?" }, { id: "study-cobertura-q2", front: "¿B?" }, { id: "study-refuerzo-q0", front: "¿B?" }, { id: "duda-1", front: "¿C?", doubt: true }]) {
		assert.equal(deck.conceptCardGuid(COURSE, "L::1", card), legacyGuid(COURSE, "L::1", card), `mismo GUID que antes: ${card.id}`);
	}
});

await test("Historial: solo lo exportado, aceptado y de la última exportación; títulos, términos, curso y programa", () => {
	const added = { id: "card-004", front: "¿Añadida después de exportar?", conceptRefs: [2] };
	const guids = archRecord().ankiCards.map((c) => deck.conceptCardGuid(COURSE, ARCH, c));
	const records = [
		archRecord({ exportedGuids: guids, ankiCards: [...archRecord().ankiCards, added, { id: "x", front: "¿Quitada?", excluded: true }] }),
		{ courseName: COURSE, lectureName: "Sin exportar", ankiCards: [{ front: "¿No está en Anki?" }] },
		{ courseName: "Otro curso", lectureName: "L", exportedAt: 5, ankiCards: [{ front: "¿Otro curso?" }] },
		{ courseName: COURSE, lectureName: "Borrada", exportedAt: 5, deletedAt: 6, ankiCards: [{ front: "¿Borrada?" }] },
	];
	const all = deck.conceptsFromHistory(records);
	const entries = all.filter((e) => e.course === COURSE);
	assert.deepEqual(entries.map((e) => e.front), ["¿Qué es un hot spot para el JIT?", "¿Por qué una app Java va más rápida tras unos minutos (warm-up)?", "¿Dónde viven los objetos creados con new?"]);
	assert.deepEqual(all.filter((e) => e.course !== COURSE).map((e) => [e.course, e.courseKey]), [["Otro curso", "otro-curso"]], "los demás cursos también entran (el alcance lo decide proximityOf)");
	assert.deepEqual(entries[0].titles, ["Qué es un hot spot"]);
	assert.deepEqual(entries[2].terms, ["JIT", "heap", "new"], "conceptTerms de su lección + el código del frente (+ sus etiquetas, si las tiene)");
	assert.equal(entries[0].lessonKey, "arquitectura-de-la-jvm");
	assert.equal(deck.conceptsFromHistory([archRecord({ dcTrackSlug: "java-developer" })])[0].tracks[0], "java-developer");
	// Una sesión posterior que reconoció una idea «ya en tu mazo» suma su título a la tarjeta original.
	const later = {
		courseName: COURSE, lectureName: JIT, exportedAt: 2000, ankiCards: [],
		studyContent: { keyConcepts: ["Por qué mejora con el tiempo — tras el warm-up el JIT ya optimizó"], deckMatches: [{ idea: 0, front: entries[1].front, key: entries[1].key, lesson: ARCH, via: "frente", source: "historial" }] },
	};
	const chained = deck.conceptsFromHistory([archRecord(), later]);
	assert.deepEqual(chained.find((e) => e.key === entries[1].key).titles, ["Para qué sirve el warm-up", "Por qué mejora con el tiempo"]);
});

await test("Anki: manda lo que hay de verdad; el historial solo pone títulos y términos", () => {
	const notes = [
		{ id: 1700000000001, front: "¿Qué es un <em>hot spot</em> para el JIT?", lesson: ARCH, tags: ["kinema::curso::java", "kinema::leccion::arquitectura-de-la-jvm", "kinema::tema::hot-spot"] },
		{ id: 1700000000009, front: "¿Tarjeta de otro equipo?", lesson: "Otra", tags: ["kinema::leccion::otra"] },
	];
	const entries = deck.conceptsFromAnki(notes, [archRecord()], { course: COURSE });
	assert.deepEqual(entries.map((e) => e.noteId), [1700000000009, 1700000000001], "las más recientes primero");
	const hot = entries[1];
	assert.deepEqual(hot.titles, ["Qué es un hot spot"], "el título sale del historial");
	assert(hot.terms.includes("hot spot") && hot.terms.includes("JIT"), `términos: ${hot.terms}`);
	assert(!entries.some((e) => /warm-up/.test(e.front)), "lo que no está en Anki no cuenta, aunque el historial lo tenga");
	assert(entries.every((e) => e.course === COURSE), "las de la búsqueda del curso son de ese curso (también las antiguas sin etiqueta)");
	// Las de otros cursos: curso y programa por etiqueta; el nombre, del historial o del registro de mazos.
	const others = deck.conceptsFromAnki([{ id: 5, front: "¿Qué es SELECT?", lesson: "L1", tags: ["kinema::curso::intro-to-sql", "kinema::track::data-analyst"] }, { id: 6, front: "¿Sin etiqueta?", lesson: "L", tags: [] }], [], { courseNames: { "intro-to-sql": "Intro to SQL" } });
	assert.deepEqual(others.map((e) => [e.courseKey, e.course, e.tracks]), [["", "", []], ["intro-to-sql", "Intro to SQL", ["data-analyst"]]]);
});

await test("Prompt: qué tarjetas viajan (todas si caben; si no, esta lección, términos de la transcripción y lo reciente)", () => {
	const javaKey = design.kinemaSlug(COURSE);
	const mk = (i, extra = {}) => ({ front: `¿Tarjeta ${i}?`, key: `tarjeta${i}`, titles: [], terms: [], lesson: `L${i}`, lessonKey: `l${i}`, courseKey: javaKey, course: COURSE, tracks: [], at: 100 - i, ...extra });
	const entries = [
		mk(1), mk(2, { terms: ["warm-up"] }), mk(3, { lessonKey: "jit-y-rendimiento-en-caliente", lesson: JIT }), mk(4, { key: "tarjeta1" }),
		mk(5, { courseKey: "spring-boot", course: "Spring Boot", terms: ["JIT"] }), // otro curso, con un nombre canónico de la lección
		mk(6, { courseKey: "react", course: "React", terms: ["hooks"] }), // otro curso sin nada en común: no viaja
		mk(7, { courseKey: "intro-to-sql", course: "Intro to SQL", tracks: ["java-path"] }), // mismo programa (etiqueta)
	];
	const transcript = "After the warm up the JIT compiles hot spots.";
	const sent = deck.selectForPrompt(entries, { scope: scopeOf(JIT, { program: { slug: "java-path", courseKeys: [] } }), transcript });
	assert.deepEqual(sent.map((s) => [s.ref, s.key]), [["m1", "tarjeta3"], ["m2", "tarjeta2"], ["m3", "tarjeta1"], ["m4", "tarjeta7"], ["m5", "tarjeta5"]],
		"misma lección → curso (con término) → curso → su programa → otro curso con un término; uno sin nada en común no viaja; un frente repetido, una vez");
	assert.deepEqual([sent[3].course, sent[4].course, sent[0].course], ["Intro to SQL", "Spring Boot", undefined], "las de otro curso dicen de cuál son");
	assert.equal(deck.selectForPrompt(entries, { scope: scopeOf("x"), transcript: "", limit: 2 }).length, 2);
	assert.deepEqual(deck.deckPromptLine({ ref: "m1", front: "¿F?", title: "Título", lesson: "L" }), { ref: "m1", text: "«Título» — ¿F?", lesson: "L" });
	assert.deepEqual(deck.deckPromptLine({ ref: "m2", front: "¿G?", lesson: "L", course: "C" }), { ref: "m2", text: "¿G?", lesson: "L", course: "C" });
	const many = Array.from({ length: 60 }, (_, i) => mk(i + 10));
	assert.equal(deck.selectForPrompt(many, { scope: scopeOf("x"), transcript: "" }).length, deck.PROMPT_DECK_LIMIT, "tope de 40");
});

await test("Prompt: sin mazo, el de siempre; con mazo, la lista con ids y la regla de inDeck", () => {
	const transcript = "x".repeat(3000);
	const meta = { lectureKey: "l", courseSlug: "c", lectureId: "l", courseName: "C", lessonName: "L" };
	const plain = prompts.buildStudyPrompt(transcript, meta);
	assert(!plain.includes("IDEAS QUE YA ESTÁN") && !plain.includes("inDeck"), "sin mazo no cambia nada");
	assert(plain.includes("- ankiCards: al menos una tarjeta por keyConcept (todas las ideas cubiertas)."), "la regla de cobertura de siempre");
	const withDeck = prompts.buildStudyPrompt(transcript, { ...meta, deckIdeas: [{ ref: "m1", text: "«Qué es un hot spot» — ¿Qué es un hot spot para el JIT?", lesson: ARCH }, { ref: "m2", text: "¿Qué es SELECT?", lesson: "L1", course: "Intro to SQL" }] });
	assert(withDeck.includes(`- m1 · «Qué es un hot spot» — ¿Qué es un hot spot para el JIT? · lección «${ARCH}»\n`));
	assert(withDeck.includes("- m2 · ¿Qué es SELECT? · lección «L1» del curso «Intro to SQL»"), "la de otro curso dice de cuál es");
	assert(/Una tarjeta de OTRO curso solo cuenta si su respuesta vale tal cual en esta lección/.test(withDeck));
	assert(withDeck.includes('"inDeck": [{ "idea": 0, "ref": "m1" }],'), "el esquema lleva inDeck");
	assert(/mantenla en keyConcepts y en questions/.test(withDeck) && /NO generes ninguna ankiCard para ella/.test(withDeck), "se practica igual, sin tarjeta");
	assert(/En la duda, NO la pongas en inDeck/.test(withDeck) && /Usa SOLO ids de la lista/.test(withDeck), "prudencia y solo ids de la lista");
	assert(withDeck.includes("al menos una tarjeta por keyConcept que NO esté en inDeck"));
	// Lo que llega del dock al service worker.
	const raw = [{ ref: "m1", text: "  a  b " }, { ref: "x9", text: "mal id" }, { ref: "m1", text: "repetido" }, { ref: "m2", text: "" }, { ref: "m3", text: "t".repeat(400), lesson: "L", course: " C " }];
	assert.deepEqual(prompts.sanitizeDeckIdeas(raw).map((d) => [d.ref, d.text.length, d.course]), [["m1", 3, undefined], ["m3", 240, "C"]]);
	assert.equal(prompts.sanitizeDeckIdeas(Array.from({ length: 60 }, (_, i) => ({ ref: `m${i + 1}`, text: "t" }))).length, 40);
	assert.deepEqual(prompts.sanitizeDeckIdeas("nada"), []);
});

const keyConcepts = [
	"Qué es un hot spot — código que se ejecuta tanto que compensa compilarlo",
	"Por qué mejora con el tiempo — tras el warm-up el JIT ya optimizó",
	"Interpretar o compilar — solo compila lo que compensa",
	"Cómo medir el rendimiento — descartar las primeras iteraciones",
];
const historyIndex = { source: "historial", entries: deck.conceptsFromHistory([archRecord()]) };

await test("Coincidencias: mismo frente en OTRA lección, mismo título de idea, y la IA solo con ids enviados", () => {
	const cards = [
		{ front: "¿Por qué una app Java va más rápida tras unos minutos (warm-up)?", conceptRefs: [1] },
		{ front: "¿Por qué la JVM interpreta al principio?", conceptRefs: [2] },
		{ front: "¿Qué hace el JIT con un <em>hot spot</em> en Android?", conceptRefs: [3] },
	];
	const sent = deck.selectForPrompt(historyIndex.entries, { scope: scopeOf(JIT), transcript: "" });
	const heap = sent.find((s) => /heap|new/.test(s.front));
	const claims = [{ idea: 3, ref: heap.ref }, { idea: 2, ref: "m99" }, { idea: 9, ref: sent[0].ref }, { idea: 1, ref: sent[0].ref }];
	const matches = deck.matchDeckIdeas({ keyConcepts, cards, claims, index: historyIndex, sent, scope: scopeOf(JIT) });
	assert.deepEqual(matches.map((m) => [m.idea, m.via]), [[0, "titulo"], [1, "frente"], [3, "ia"]], `coincidencias: ${JSON.stringify(matches)}`);
	assert(matches.every((m) => m.lesson === ARCH && m.source === "historial" && !m.sameLesson && !m.course && m.key));
	// Sin similitud léxica: «¿Qué hace el JIT con un hot spot en Android?» comparte casi todo con «¿Qué es un hot spot para el JIT?» y no cuenta.
	const noAi = deck.matchDeckIdeas({ keyConcepts, cards, index: historyIndex, scope: scopeOf(JIT) });
	assert(!noAi.some((m) => m.idea === 3), "mucho solape de palabras no es la misma tarjeta");
	// Una id de la IA, una sola idea.
	const twice = deck.matchDeckIdeas({ keyConcepts: ["Uno largo — a", "Dos largo — b"], cards: [], claims: [{ idea: 0, ref: "m1" }, { idea: 1, ref: "m1" }], index: historyIndex, sent, scope: scopeOf(JIT) });
	assert.deepEqual(twice.map((m) => m.idea), [0]);
});

await test("Coincidencias: estudiar la MISMA lección otra vez también cuenta (el mismo frente puede llevar otro GUID)", () => {
	const same = { source: "historial", entries: deck.conceptsFromHistory([archRecord()]) };
	const archIdeas = archRecord().studyContent.keyConcepts;
	const sameCards = archRecord().ankiCards;
	// La tarjeta de cobertura lleva GUID «study:»: con el mismo frente que una de la IA serían DOS notas.
	assert.notEqual(deck.conceptCardGuid(COURSE, ARCH, { id: "study-cobertura-q0", front: sameCards[0].front }), deck.conceptCardGuid(COURSE, ARCH, sameCards[0]), "mismo frente, otro GUID");
	const again = deck.matchDeckIdeas({ keyConcepts: archIdeas, cards: sameCards, index: same, scope: scopeOf(ARCH) });
	assert.deepEqual(again.map((m) => [m.idea, m.via, Boolean(m.sameLesson), m.course]), [[0, "frente", true, undefined], [1, "frente", true, undefined], [2, "frente", true, undefined]], "de una sesión anterior de esta lección");
	const reworded = [{ front: "Define hot spot en la JVM", conceptRefs: [0] }];
	assert.deepEqual(deck.matchDeckIdeas({ keyConcepts: archIdeas, cards: reworded, index: same, scope: scopeOf(ARCH) }).map((x) => [x.idea, x.via]), [[0, "titulo"], [1, "titulo"], [2, "titulo"]], "otra redacción: por el título de cada idea");
	// Una tarjeta sin idea (p. ej. la de entrevista) con el mismo frente que una de otra lección.
	const loose = deck.matchDeckIdeas({ keyConcepts, cards: [{ front: "¿Dónde viven los objetos creados con <code>new</code>?", conceptRefs: [] }], index: historyIndex, scope: scopeOf(JIT) });
	assert.deepEqual(loose.map((x) => [x.idea, x.via]), [[0, "titulo"], [-1, "frente"]], "(la idea 0, por su título; la tarjeta sin idea, por su frente)");
	// La pregunta de UNA idea con el frente de una tarjeta de otra lección.
	const viaQ = deck.matchDeckIdeas({ keyConcepts, cards: [], questions: [{ q: "¿Dónde viven los objetos creados con new?", conceptRefs: [2] }, { q: "¿Qué es un hot spot para el JIT?", conceptRefs: [0, 1] }], index: historyIndex, scope: scopeOf(JIT) });
	assert.deepEqual(viaQ.map((x) => [x.idea, x.via]), [[0, "titulo"], [2, "frente"]], "la de síntesis (varias ideas) no cuenta");
});

await test("Alcance: frente y título en el curso y su programa; entre cursos sin relación, solo la IA", () => {
	const react = { courseName: "React Hooks", lectureName: "useEffect", exportedAt: 9, ankiCards: [{ id: "r1", front: "¿Qué es un <em>hot spot</em> para el JIT?", conceptRefs: [0], tags: ["jit"] }], studyContent: { keyConcepts: ["Qué es un hot spot — otra cosa en React"] } };
	const sql = { courseName: "Intro to SQL", lectureName: "Select", exportedAt: 8, dcTrackSlug: "java-path", ankiCards: [{ id: "s1", front: "¿Qué hace el JIT con el código caliente?", conceptRefs: [0] }], studyContent: { keyConcepts: ["Por qué mejora con el tiempo — ya compiló lo caliente"] } };
	const index = { source: "historial", entries: deck.conceptsFromHistory([react, sql]) };
	const cards = [{ front: "¿Qué es un <em>hot spot</em> para el JIT?", conceptRefs: [0] }];
	// Sin programa: React e Intro to SQL son «otros cursos» → ni frente ni título.
	assert.deepEqual(deck.matchDeckIdeas({ keyConcepts, cards, index, scope: scopeOf(JIT) }), [], "el mismo frente o el mismo título en otro curso no basta");
	// Con el programa (por su etiqueta o por la lista de cursos del programa), sí.
	const byTag = deck.matchDeckIdeas({ keyConcepts, cards, index, scope: scopeOf(JIT, { program: { slug: "java-path", courseKeys: [] } }) });
	assert.deepEqual(byTag.map((m) => [m.idea, m.via, m.course]), [[1, "titulo", "Intro to SQL"]], "del mismo programa: cuenta, y dice de qué curso es");
	const byList = deck.matchDeckIdeas({ keyConcepts, cards, index, scope: scopeOf(JIT, { program: { slug: "otro", courseKeys: ["react-hooks"] } }) });
	assert.deepEqual(byList.map((m) => [m.idea, m.via, m.course]), [[0, "frente", "React Hooks"]]);
	assert.equal(deck.proximityOf({ courseKey: "react-hooks", lessonKey: "x", tracks: [] }, scopeOf(JIT)), "other");
	// La IA sí puede decirlo de otro curso, con un id de la lista.
	const sent = deck.selectForPrompt(index.entries, { scope: scopeOf(JIT), transcript: "the JIT compiles hot spots" });
	const ai = deck.matchDeckIdeas({ keyConcepts, cards: [], claims: [{ idea: 0, ref: sent[0].ref }], index, sent, scope: scopeOf(JIT) });
	assert.deepEqual(ai.map((m) => [m.idea, m.via, Boolean(m.course)]), [[0, "ia", true]]);
});

await test("Cobertura: lo que ya está cuenta como cubierto; su tarjeta queda fuera del paquete; determinista", () => {
	const make = (c) => ({ ...c });
	const questions = [
		{ q: "¿Qué convierte un método en hot spot?", answer: "Que se ejecuta mucho", conceptRefs: [0] },
		{ q: "¿Por qué va más lenta al arrancar?", answer: "Interpreta", conceptRefs: [1] },
		{ q: "¿Por qué no compila todo?", answer: "Cuesta", conceptRefs: [2] },
		{ q: "¿Qué falla al medir una vez?", answer: "Sin calentar", conceptRefs: [3] },
		{ q: "¿Desactivar el JIT?", answer: "No", conceptRefs: [0, 2, 3] },
	];
	const cards = [
		{ id: "card-001", type: "concepto", front: "¿Por qué una app Java va más rápida tras unos minutos (warm-up)?", back: "b", tags: [], conceptRefs: [1] },
		{ id: "card-002", type: "comparacion", front: "¿Interpretar o compilar?", back: "b", tags: [], conceptRefs: [2] },
		{ id: "card-003", type: "aplicacion", front: "¿Cómo medir?", back: "b", tags: [], conceptRefs: [3, 1] },
	];
	const matches = deck.matchDeckIdeas({ keyConcepts, cards, questions, index: historyIndex, scope: scopeOf(JIT) });
	const d = deck.deckCoverage(matches);
	const out = cov.ensureConceptCards(keyConcepts, questions, cards, make, d);
	assert.deepEqual(out.map((c) => [c.id, Boolean(c.inDeck), Boolean(c.excluded)]), [
		["card-001", true, true], ["card-002", false, false], ["card-003", false, false], ["study-cobertura-q0", true, true],
	], "la idea 0 (ya en el mazo) tiene su tarjeta de cobertura, fuera del paquete; la 3 mezcla una idea nueva y se queda");
	assert.deepEqual(cov.ideasWithoutCard(keyConcepts, out, d.ideas), [], "ya en el mazo = cubierta");
	assert.deepEqual(cov.ideasWithoutCard(keyConcepts, out), [0], "sin contar el mazo, la 0 no tendría tarjeta en el paquete");
	const again = cov.ensureConceptCards(keyConcepts, questions, out.map(({ inDeck, excluded, ...c }) => c), make, deck.deckCoverage(deck.sanitizeDeckMatches(JSON.parse(JSON.stringify(matches)), 4)));
	assert.deepEqual(again.map((c) => [c.id, Boolean(c.excluded)]), out.map((c) => [c.id, Boolean(c.excluded)]), "al restaurar (lo guardado) sale lo mismo");
	assert.deepEqual(cov.ensureConceptCards(keyConcepts, questions, cards, make), cov.ensureConceptCards(keyConcepts, questions, cards, make, { ideas: [] }), "sin mazo, lo de la fase 1");
	assert.equal(cov.isDeckDuplicate({ front: "x", conceptRefs: [0], doubt: true }, { ideas: new Set([0]), keys: new Set() }), false, "una de duda nunca");
});

await test("deckMatches guardados: se validan al restaurar", () => {
	const raw = [
		{ idea: 0, front: "¿A?", key: "a", lesson: "L", via: "titulo", source: "anki", noteId: 12, rescheduledAt: 99 },
		{ idea: 0, front: "¿Repetida?", lesson: "L", via: "ia", source: "anki" },
		{ idea: 7, front: "¿Fuera de rango?", lesson: "L", via: "ia" },
		{ idea: 1, front: "", lesson: "L", via: "ia" },
		{ idea: 1, front: "¿Vía rara?", lesson: "L", via: "jaccard" },
		{ idea: -1, front: "¿Sin clave?", lesson: "L", via: "frente" },
		{ idea: -1, front: "¿Con clave?", key: "conclave", lesson: "L", via: "frente", noteId: -3 },
	];
	assert.deepEqual(deck.sanitizeDeckMatches(raw, 3), [
		{ idea: 0, front: "¿A?", via: "titulo", lesson: "L", source: "anki", noteId: 12, key: "a", rescheduledAt: 99 },
		{ idea: -1, front: "¿Con clave?", via: "frente", lesson: "L", source: "historial", key: "conclave" },
	]);
	assert.deepEqual(deck.sanitizeDeckMatches(null, 3), []);
	assert.deepEqual(deck.deckIdeaMatches({ keyConcepts: ["a", "b", "c"], deckMatches: raw }).map((m) => m.idea), [0]);
});

// ── Anki simulado: un card por nota, con su tipo y su cola ────────────────
function fakeAnki(notes) {
	const log = [];
	const cardOf = (n) => ({ ...n, id: n.id * 10 });
	const flag = (q, t) => new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(q);
	const matches = (q, n) => {
		const nid = q.match(/nid:(\d+)/);
		if (nid && Number(nid[1]) !== n.id) return false;
		if (q.includes('note:"Udemy Bridge Concept"') && n.model !== "Udemy Bridge Concept") return false;
		const review = n.type === "review" || n.type === "relearning";
		const learn = n.type === "learning" || n.type === "relearning";
		const susp = n.queue === "suspended";
		const buried = n.queue === "buried";
		const due = !susp && !buried && n.type !== "new" && n.due;
		const checks = [
			["is:review", review], ["is:learn", learn], ["is:new", n.type === "new"], ["is:due", due], ["is:suspended", susp], ["is:buried", buried],
		];
		const or = q.includes("(is:suspended OR is:buried)");
		const clean = q.replace("(is:suspended OR is:buried)", " ");
		for (const [t, v] of checks) {
			if (flag(clean, `-${t}`) && v) return false;
			if (flag(clean, t) && !v) return false;
		}
		return !or || susp || buried;
	};
	const invoke = async (action, params = {}) => {
		log.push({ action, params });
		if (action === "findNotes") return notes.map((n) => n.id);
		if (action === "notesInfo") return params.notes.map((id) => notes.find((n) => n.id === id)).filter(Boolean).map((n) => ({ noteId: n.id, tags: n.tags ?? [], fields: { Front: { value: n.front, order: 0 }, Leccion: { value: n.lesson ?? "", order: 2 } } }));
		if (action === "findCards") return notes.filter((n) => matches(params.query, n)).map((n) => cardOf(n).id);
		if (action === "setDueDate") { for (const id of params.cards) { const n = notes.find((x) => x.id * 10 === id); if (n) n.due = true; } return true; }
		throw new Error(`acción ${action}`);
	};
	return { invoke, log };
}

await test("Anki: lee las tarjetas del curso (solo lectura), las más recientes primero, en lotes de 500", async () => {
	const many = Array.from({ length: 1203 }, (_, i) => ({ id: i + 1, front: `<p>F${i + 1}</p>`, lesson: "<b>L</b>", tags: ["kinema::leccion::l"], model: "Udemy Bridge Concept" }));
	const { invoke, log } = fakeAnki(many);
	const notes = await ops.conceptNotes(invoke, "QUERY-DEL-CURSO", { limit: 1100 });
	assert.equal(log[0].params.query, "QUERY-DEL-CURSO", "la búsqueda del curso, tal cual");
	assert.equal(notes.length, 1100);
	assert.deepEqual([notes[0].id, notes[0].front, notes[0].lesson], [1203, "<p>F1203</p>", "L"], "la más reciente primero; lección sin HTML");
	assert.deepEqual(log.filter((l) => l.action === "notesInfo").map((l) => l.params.notes.length), [500, 500, 100]);
	assert(log.every((l) => ["findNotes", "notesInfo"].includes(l.action)), "solo lectura");
});

await test("Repasar hoy en Anki: SOLO tarjetas en repaso y activas, setDueDate \"0\" sin «!»; las nuevas y en aprendizaje no se tocan", async () => {
	const model = "Udemy Bridge Concept";
	const notes = [
		{ id: 11, type: "review", queue: "active", due: false, model },
		{ id: 12, type: "new", queue: "active", due: false, model },
		{ id: 13, type: "learning", queue: "active", due: true, model },
		{ id: 14, type: "relearning", queue: "active", due: false, model },
		{ id: 15, type: "review", queue: "suspended", due: false, model },
		{ id: 16, type: "review", queue: "active", due: true, model },
		{ id: 17, type: "review", queue: "active", due: false, model: "Basic" },
		{ id: 18, type: "review", queue: "buried", due: false, model },
	];
	const { invoke, log } = fakeAnki(notes);
	const states = await ops.noteReviewStates(invoke, [11, 12, 13, 14, 15, 16, 17, 18, 99, 11]);
	assert.deepEqual(states.map((s) => [s.noteId, s.state]), [[11, "review"], [12, "new"], [13, "learning"], [14, "learning"], [15, "inactive"], [16, "due"], [17, "foreign"], [18, "inactive"], [99, "missing"]]);
	assert(log.every((l) => l.action === "findCards"), "mirar el estado es solo lectura");
	assert.equal(log[0].params.query, 'nid:11 note:"Udemy Bridge Concept" is:review -is:learn -is:suspended -is:buried -is:due', "la búsqueda de lo que se puede adelantar");
	assert.equal(ops.RESCHEDULABLE, "is:review -is:learn -is:suspended -is:buried -is:due");
	log.length = 0;
	const result = await ops.rescheduleToday(invoke, [11, 12, 13, 14, 15, 16, 17, 18]);
	const writes = log.filter((l) => l.action !== "findCards");
	assert.deepEqual(writes, [{ action: "setDueDate", params: { cards: [110], days: "0" } }], "un solo cambio: la tarjeta en repaso de la nota 11, con \"0\" (conserva el intervalo)");
	assert.deepEqual([result.changed, result.cards], [[11], 1]);
	assert.equal(notes.find((n) => n.id === 12).type, "new", "la nueva sigue nueva");
	// Nada que adelantar → no se llama a setDueDate.
	log.length = 0;
	const none = await ops.rescheduleToday(invoke, [12, 13]);
	assert.deepEqual([none.changed, log.some((l) => l.action === "setDueDate")], [[], false]);
	// Y la que ya se adelantó, ahora ya toca hoy: no se vuelve a tocar.
	assert.equal((await ops.noteReviewStates(invoke, [11]))[0].state, "due");
});

await test("Anki: la búsqueda de los demás cursos (solo conceptos de Kinema, sin el curso de la sesión)", () => {
	assert.equal(dest.otherCoursesConceptsQuery(COURSE), 'note:"Udemy Bridge Concept" -tag:kinema::curso::java-in-depth-become-a-complete-java-engineer');
});

await test("Anki: los ids de nota de un historial se resuelven por su frente (y su lección)", () => {
	const matches = [
		{ idea: 0, front: "¿Qué es un hot spot para el JIT?", key: "queesunhotspotparaeljit", lesson: ARCH, via: "titulo", source: "historial" },
		{ idea: 1, front: "¿Otra?", lesson: ARCH, via: "ia", source: "anki", noteId: 77 },
		{ idea: 2, front: "¿No está?", lesson: ARCH, via: "ia", source: "historial" },
	];
	const notes = [
		{ id: 5, front: "¿Qué es un <em>hot spot</em> para el JIT?", lesson: "Otra", tags: ["kinema::leccion::otra"] },
		{ id: 6, front: "¿Qué es un <em>hot spot</em> para el JIT?", lesson: ARCH, tags: ["kinema::leccion::arquitectura-de-la-jvm"] },
	];
	assert.deepEqual(deck.resolveNoteIds(matches, notes, COURSE), { 0: 6, 1: 77 });
});

await test("Biblioteca: ideas que ya estaban, por lección y por curso (no cambian las tarjetas)", () => {
	const base = { courseId: "java", courseName: COURSE, questions: [], status: "completed", startedAt: 1, updatedAt: 2 };
	const records = [
		{ ...base, lectureId: "jit", lectureName: JIT, exportedAt: 3, ankiCardsCount: 2,
			ankiCards: [{ type: "concepto" }, { type: "concepto" }, { type: "concepto", inDeck: true, excluded: true }],
			studyContent: { keyConcepts: keyConcepts, deckMatches: [{ idea: 0, front: "¿A?", lesson: ARCH, via: "titulo", source: "historial" }, { idea: 1, front: "¿B?", lesson: ARCH, via: "frente", source: "historial" }] } },
		{ ...base, lectureId: "arch", lectureName: ARCH, ankiCardsCount: 3, ankiCards: [{ type: "concepto" }, { type: "concepto" }, { type: "concepto" }] },
	];
	const [group] = lib.buildLibrary(records, { config: { rootDeck: "Kinema" }, registry: {} });
	const course = group.courses[0];
	assert.equal(course.inDeckIdeas, 2);
	assert.deepEqual(course.lessons.map((l) => [l.rec.lectureId, l.inDeck.length, l.cards.total]), [["jit", 2, 2], ["arch", 0, 3]], "la que quedó fuera no cuenta como tarjeta");
	assert.deepEqual(course.cards, { total: 5, reinforce: 0, doubt: 0, interview: 0, inAnki: 2, pending: 3 }, "las cifras de tarjetas no cambian");
	// «Sin descargar» cuenta solo las aceptadas: una lección con todo ya en el mazo (o quitado) no está pendiente.
	const allInDeck = { ...base, lectureId: "x", lectureName: "X", finishedAt: 5, ankiCards: [{ type: "concepto", inDeck: true, excluded: true }] };
	assert.equal(lib.acceptedCardCount(allInDeck), 0);
	assert.equal(lib.isPendingExport(allInDeck), false, "nada que descargar");
	assert.equal(lib.isPendingExport({ ...allInDeck, ankiCards: [{ type: "concepto" }, { type: "concepto", excluded: true }] }), true);
	assert.equal(lib.buildLibrary([allInDeck], { config: { rootDeck: "Kinema" }, registry: {} })[0].courses[0].lessons[0].pending, false);
});

await test("Obsidian: la idea dice «ya en tu mazo» con enlace a la nota de su lección; sin mazo, la nota de siempre", () => {
	const content = {
		relevance: { score: 80, reason: "r" }, keyConcepts, questions: [], application: { isCode: false, setup: "", challenge: "", solution: "" },
		interviewQ: null, nextAction: "", ankiCards: [{ front: "¿F?", back: "B" }],
	};
	const data = (extra) => ({
		courseName: COURSE, lessonName: JIT,
		result: { title: "Lección completada", remembered: { count: 1, total: 4 }, check: { firstTry: 0, improved: 0, skipped: true }, practice: "later", cards: { total: 1, reinforce: 0, destination: "anki" } },
		content: { ...content, ...extra },
	});
	const cfg = { ...obs.DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: "V" };
	const md = obs.buildSessionNoteMarkdown(data({ deckMatches: [
		{ idea: 0, front: "¿Qué es un hot spot para el JIT?", lesson: ARCH, via: "titulo", source: "anki", rescheduledAt: 5 },
		{ idea: 1, front: "¿Warm-up?", lesson: JIT, sameLesson: true, via: "ia", source: "anki" },
		{ idea: 2, front: "¿Interpretar?", lesson: "Select", course: "Intro to SQL", via: "ia", source: "anki" },
	] }), cfg);
	assert(md.includes("- **Qué es un hot spot** — código que se ejecuta tanto que compensa compilarlo · _ya en tu mazo: [[java-in-depth-become-a-complete-java-engineer---arquitectura-de-la-jvm|Arquitectura de la JVM]] · adelantada a hoy en Anki_"), md);
	assert(md.includes("· _ya en tu mazo: de una sesión anterior de esta lección_"));
	assert(md.includes("· _ya en tu mazo: [[intro-to-sql---select|Select]] (curso «Intro to SQL»)_"), "de otro curso: enlace a la nota de ESE curso");
	assert(md.includes("- Tarjetas: 1 (0 de refuerzo) · en Anki · 3 ideas ya estaban en tu mazo"));
	const plain = obs.buildSessionNoteMarkdown(data({}), cfg);
	assert(!plain.includes("ya en tu mazo") && !plain.includes("ya estaban en tu mazo"), "sin mazo, nada nuevo");
});

console.log(`QA unidades de la fase 4 (duplicados): ${passed}/${passed} OK`);
