// Tests puros de la Biblioteca (fase 2): Programa → Curso → Lección desde el
// historial, mazo del curso con la fuente única, cifras, filtros y búsquedas.
// node scripts/qa-library-units.mjs
import assert from "node:assert/strict";

const root = new URL("../src/", import.meta.url);
const lib = await import(new URL("app/services/library.ts", root).href);
const dest = await import(new URL("app/services/ankiDestination.ts", root).href);
const ops = await import(new URL("app/services/ankiConnectOps.ts", root).href);
const totals = await import(new URL("app/services/courseTotals.ts", root).href);

let passed = 0;
const test = async (name, fn) => {
	try { await fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}`); throw error; }
};

const rec = (over) => ({ courseId: "c", courseName: "C", lectureId: "l", lectureName: "L", startedAt: 1, updatedAt: 1, status: "in_progress", questions: [], ankiCardsCount: 0, ...over });
const java = "Java In-Depth: Become a Complete Java Engineer!";
const records = [
	rec({ courseId: "java", courseName: java, lectureId: "l2", lectureName: "Data Types", startedAt: 20, updatedAt: 30, status: "completed", exportedAt: 31, ankiDeck: `Kinema::Courses::${java}`, ankiCardsCount: 3, ankiCards: [{ type: "concepto" }, { type: "entrevista" }, { type: "concepto", excluded: true }] }),
	rec({ courseId: "java", courseName: java, lectureId: "l1", lectureName: "What is Java & JVM?", startedAt: 10, updatedAt: 40, status: "completed", ankiCardsCount: 2, ankiCards: [{ type: "concepto", reinforce: true }, { type: "concepto", reinforce: true, doubt: true }], obsidianExportedAt: 41 }),
	rec({ courseId: "py", courseName: "Introduction to Python", lectureId: "v", lectureName: "Variables", startedAt: 5, updatedAt: 6, dcTrackSlug: "data-scientist-in-python" }),
	rec({ courseId: "py", courseName: "Introduction to Python", lectureId: "f", lectureName: "Functions", startedAt: 7, updatedAt: 8, dcTrackSlug: "data-scientist-in-python" }),
	rec({ courseId: "py", courseName: "Introduction to Python", lectureId: "p", lectureName: "Packages", startedAt: 9, updatedAt: 9, dcTrackSlug: "python-programming" }),
	rec({ courseId: "sql", courseName: "Intro to SQL", lectureId: "s", lectureName: "Select", startedAt: 3, updatedAt: 50, dcTrackSlug: "data-analyst" }),
];
const config = { rootDeck: "Kinema" };

await test("Biblioteca: Programa → Curso → Lección; programas primero, los cursos sin programa al final", () => {
	const groups = lib.buildLibrary(records, { config, registry: {}, programTitles: { "data-scientist-in-python": "Data Scientist in Python" } });
	assert.deepEqual(groups.map((g) => g.program?.title ?? null), ["Data Analyst", "Data Scientist in Python", null], "por título, sin programa al final");
	const py = groups[1].courses[0];
	assert.equal(py.program.title, "Data Scientist in Python", "el programa más estudiado es el principal");
	assert.deepEqual(py.otherPrograms, [{ slug: "python-programming", title: "Python Programming" }], "el resto, «también en» (sin duplicar el curso)");
	assert.equal(groups.flatMap((g) => g.courses).filter((c) => c.courseId === "py").length, 1, "un curso de varios programas aparece una sola vez");
	const j = groups[2].courses[0];
	assert.deepEqual(j.lessons.map((l) => l.rec.lectureName), ["What is Java & JVM?", "Data Types"], "las lecciones en el orden en que se estudiaron");
	assert.equal(lib.prettifySlug("data-analyst"), "Data Analyst");
});

await test("Biblioteca: cifras del historial (lo quitado no cuenta; refuerzo ≠ duda), pendientes y Obsidian", () => {
	const j = lib.buildLibrary(records, { config, registry: {} }).find((g) => !g.program).courses[0];
	assert.deepEqual(j.cards, { total: 4, reinforce: 1, doubt: 1, interview: 1, inAnki: 2, pending: 2 });
	assert.deepEqual([j.studied, j.finished, j.inObsidian], [2, 2, 1]);
	const [first, second] = j.lessons;
	assert.equal(first.pending, true, "terminada, con tarjetas y sin exportar: pendiente");
	assert.equal(second.inAnki, true);
	assert.deepEqual(first.tags, [`kinema::curso::${"java-in-depth-become-a-complete-java-engineer"}`, "kinema::leccion::what-is-java-jvm"]);
	assert.deepEqual(lib.lessonCards(rec({ ankiCardsCount: 5 })), { total: 5, reinforce: 0, doubt: 0, interview: 0 }, "registros antiguos sin tarjetas guardadas: su recuento");
	assert.deepEqual(j.decksUsed, [`Kinema::Courses::${java}`]);
});

await test("Biblioteca: el mazo del curso es el de Fijar (registro o, si no, uno por curso; el programa no lo cambia)", () => {
	const course = (groups) => groups.flatMap((g) => g.courses).find((c) => c.courseId === "py");
	assert.equal(course(lib.buildLibrary(records, { config, registry: {} })).deck.deck, "Kinema::Courses::Introduction to Python");
	assert.equal(course(lib.buildLibrary(records, { config: { ...config, groupByProgram: true }, registry: {} })).deck.deck, "Kinema::Courses::Introduction to Python", "fase 5: «Por programa» (config antigua) ya no cambia el mazo");
	const registry = { [dest.courseKey("Introduction to Python")]: { deck: "Mis cursos::Python", at: 1 } };
	const assigned = course(lib.buildLibrary(records, { config, registry }));
	assert.deepEqual([assigned.deck.deck, assigned.deck.owned, assigned.deckAssigned], ["Mis cursos::Python", false, true], "el asignado manda y se dice si es un mazo tuyo");
	const legacy = { [dest.courseKey("Introduction to Python")]: { deck: "Kinema::Programs::Data Scientist In Python::Introduction to Python", at: 1 } };
	assert.equal(course(lib.buildLibrary(records, { config, registry: legacy })).deck.deck, "Kinema::Programs::Data Scientist In Python::Introduction to Python", "un curso fijado con la estructura de antes se queda en su mazo (no se reparte)");
	const lessonLayout = course(lib.buildLibrary(records, { config: { ...config, conceptLayout: "lesson" }, registry: {} }));
	assert.equal(lessonLayout.deck.deck, "Kinema::Courses::Introduction to Python", "por lección (config antigua): el mazo del curso");
});

await test("Biblioteca (fase 5): programas de un curso (N:M) y lo que espera a Anki u Obsidian", () => {
	const recs = [
		{ courseName: "Intro to SQL", dcTrackSlug: "data-analyst" },
		{ courseName: "Intro to SQL", dcTrackSlug: "sql-fundamentals" },
		{ courseName: "Intro to SQL" },
		{ courseName: "Otro curso", dcTrackSlug: "otro-programa" },
	];
	assert.deepEqual(lib.courseProgramSlugs(recs, "Intro to SQL", "data-engineer"), ["data-analyst", "data-engineer", "sql-fundamentals"], "todos los programas con los que estudiaste el curso, y el de ahora");
	assert.deepEqual(lib.courseProgramSlugs(recs, "Intro to SQL"), ["data-analyst", "sql-fundamentals"]);
	assert.deepEqual(lib.courseProgramSlugs([{ courseName: "Java" }], "Java", null), [], "Udemy: sin programa");
	const done = { status: "completed", finishedAt: 1, ankiCards: [{ front: "a" }], studyContent: {} };
	assert.equal(lib.isWaitingForAnki({ ...done, syncPending: { anki: 5 } }), true, "terminada sin Anki: espera");
	assert.equal(lib.isWaitingForAnki(done), false, "terminada antes de la fase 5 y sin enviar: no se envía sola (la Biblioteca la ofrece)");
	assert.equal(lib.isPendingExport(done), true);
	assert.equal(lib.isWaitingForAnki({ ...done, ankiCards: [{ front: "a", excluded: true }], syncPending: { anki: 5 } }), false, "sin tarjetas aceptadas no hay nada que enviar");
	assert.equal(lib.isWaitingForAnki({ ...done, deletedAt: 9, syncPending: { anki: 5 } }), false);
	assert.equal(lib.isWaitingForObsidian({ ...done, syncPending: { obsidian: 5 } }), true);
	assert.equal(lib.isWaitingForObsidian({ ...done, studyContent: undefined, syncPending: { obsidian: 5 } }), false, "sin contenido no se puede rehacer la nota");
	assert.deepEqual(lib.lessonTags({ courseName: "Intro to SQL", lectureName: "Joins", dcTrackSlug: "data-analyst" }), ["kinema::curso::intro-to-sql", "kinema::leccion::joins", "kinema::programa::data-analyst"], "las etiquetas de ahora (antes kinema::track)");
});

await test("Biblioteca: filtros por refuerzo, duda, entrevista y sin descargar", () => {
	const j = lib.buildLibrary(records, { config, registry: {} }).find((g) => !g.program).courses[0];
	assert.deepEqual(lib.filterCounts(j.lessons), { all: 2, reinforce: 1, doubt: 1, interview: 1, pending: 1 });
	assert.deepEqual(lib.filterLessons(j.lessons, "interview").map((l) => l.rec.lectureId), ["l2"]);
	assert.deepEqual(lib.filterLessons(j.lessons, "doubt").map((l) => l.rec.lectureId), ["l1"]);
	assert.equal(lib.filterLessons(j.lessons, "all").length, 2);
});

await test("Biblioteca: las búsquedas de los repasos pendientes, solo conceptos, con su desglose", () => {
	const j = lib.buildLibrary(records, { config, registry: {} }).find((g) => !g.program).courses[0];
	const q = lib.courseAnkiQueries(j, config);
	const base = dest.kinemaCardsQuery("course", { rootDeck: "Kinema", course: java, courseDeck: j.deck.deck });
	assert.equal(lib.NOT_VOCAB, '-note:"Kinema · Vocab · *" -note:"Udemy Bridge Vocab"', "fuera las dos familias de vocabulario");
	assert.equal(q.cards, base, "la misma búsqueda que los repasos pendientes (ya sin vocabulario)");
	assert(base.endsWith(` ${lib.NOT_VOCAB}`));
	assert.deepEqual(
		[q.due, q.fresh, q.learning, q.relearning, q.reinforce, q.suspended].map((x) => x.slice(q.cards.length)),
		[" is:due", " -is:suspended -is:buried is:new", " -is:suspended -is:buried is:learn -is:review", " -is:suspended -is:buried is:learn is:review", " tag:kinema::reforzar", " is:suspended"],
		"para hoy, nuevas/aprendiendo/reaprendiendo ACTIVAS (como la pantalla de mazos de Anki), refuerzo y suspendidas aparte",
	);
	const owned = { ...j, deck: dest.conceptDestination(config, java, "", { assigned: { deck: "Kinema::Mío", at: 1 } }) };
	assert(lib.courseAnkiQueries(owned, config).cards.includes('deck:"Kinema::Mío"') && lib.courseAnkiQueries(owned, config).cards.endsWith(lib.NOT_VOCAB), "un mazo propio compartido con vocabulario: solo sus conceptos");
	const lq = lib.lessonAnkiQueries(j.lessons[0].rec, config);
	assert.equal(lq.due, dest.dueQuery("lesson", { rootDeck: "Kinema", course: java, lesson: "What is Java & JVM?" }));
});

await test("AnkiConnect: varias búsquedas de una vez, solo lectura y con tope", async () => {
	const calls = [];
	const invoke = async (action, params) => { calls.push(action); return Array.from({ length: params.query.length % 7 }, (_, i) => i); };
	const queries = Array.from({ length: ops.MAX_COUNT_QUERIES + 3 }, (_, i) => `q${"x".repeat(i)}`);
	const counts = await ops.countManyCards(invoke, queries);
	assert.equal(counts.length, queries.length);
	assert.deepEqual(counts.slice(-3), [-1, -1, -1], "lo que pasa del tope no se pregunta");
	assert(calls.every((a) => a === "findCards") && calls.length === ops.MAX_COUNT_QUERIES, "solo findCards, hasta el tope");
	assert.deepEqual(await ops.countManyCards(invoke, ["", "  "]), [-1, -1], "búsquedas vacías no se mandan");
});

await test("Temario: el total sale de la plataforma, con los campos verificados", () => {
	// Forma real (2026-11): Udemy distingue publicadas de totales; en DataCamp nb_exercises no cuadra con la lista.
	assert.equal(totals.udemyLectureTotal({ _class: "course", id: 358540, num_lectures: 592, num_published_lectures: 475 }), 475);
	assert.equal(totals.udemyLectureTotal({ num_lectures: 10 }), null, "sin publicadas, no se adivina");
	const chapter = (videos, normal, nb) => ({ nb_exercises: nb, number_of_videos: videos, exercises: [...Array(videos).fill({ type: "VideoExercise" }), ...Array(normal).fill({ type: "NormalExercise" })] });
	const dc = { chapters: [chapter(2, 8, 8), chapter(3, 10, 13), chapter(3, 9, 12), chapter(3, 10, 13)] };
	assert.equal(totals.dataCampVideoTotal(dc), 11, "vídeos = lecciones de Kinema");
	assert.equal(totals.dataCampVideoTotal({ chapters: [{ number_of_videos: 4 }, { number_of_videos: 2 }] }), 6, "sin lista de ejercicios: number_of_videos");
	assert.equal(totals.dataCampVideoTotal({ chapters: [] }), null);
	assert.equal(totals.dataCampVideoTotal(null), null);
});

await test("Temario: clave por título (página y API), «C++» ≠ «C#», y escritura en storage", async () => {
	assert.notEqual(totals.courseTotalKey("C++ Fundamentals"), totals.courseTotalKey("C# Fundamentals"));
	const saved = totals.withCourseTotal({}, ["Java In-Depth: Become a Complete Java Engineer!", "Java In-Depth: Become a Complete Java Engineer! [2026]", null], { total: 475, source: "udemy", at: 1 });
	assert.equal(Object.keys(saved).length, 2, "los dos títulos apuntan al mismo total");
	let store = {};
	const storage = { get: (keys, cb) => cb(Object.fromEntries(keys.map((k) => [k, store[k]]))), set: (items, cb) => { store = { ...store, ...items }; cb?.(); } };
	await totals.saveCourseTotal(storage, ["Intro to SQL"], { total: 9, source: "datacamp", at: 5 });
	await totals.saveCourseTotal(storage, ["Introduction to Python"], { total: 11, source: "datacamp", at: 6 });
	assert.deepEqual(Object.keys(await totals.readCourseTotals(storage)).sort(), ["intro-to-sql", "introduction-to-python"], "se acumulan, no se pisan");
	assert.equal(totals.isFreshTotal({ total: 1, source: "udemy", at: Date.now() - 6 * 86400000 }), true);
	assert.equal(totals.isFreshTotal({ total: 1, source: "udemy", at: Date.now() - 8 * 86400000 }), false, "a la semana se vuelve a leer");
});

await test("Temario master.dev: mismo contrato de total con source masterdev", async () => {
	let store = {};
	const storage = { get: (keys, cb) => cb(Object.fromEntries(keys.map((k) => [k, store[k]]))), set: (items, cb) => { store = { ...store, ...items }; cb?.(); } };
	await totals.saveCourseTotal(storage, ["Applied AI Engineering Fundamentals"], { total: 34, source: "masterdev", at: 7 });
	assert.deepEqual(await totals.readCourseTotals(storage), { "applied-ai-engineering-fundamentals": { total: 34, source: "masterdev", at: 7 } });
	assert.equal(totals.courseProgress(2, 34, { total: 34, source: "masterdev", at: 7 }).source, "masterdev");
});

await test("Biblioteca: porcentaje del CURSO solo con temario coherente; si no, terminadas de empezadas", () => {
	const courseTotals = {
		...totals.withCourseTotal({}, [java], { total: 475, source: "udemy", at: 1 }),
		...totals.withCourseTotal({}, ["Introduction to Python"], { total: 2, source: "datacamp", at: 1 }), // menos que lo estudiado: no cuadra
		...totals.withCourseTotal({}, ["Intro to SQL"], { total: 4, source: "datacamp", at: 1 }),
	};
	const all = lib.buildLibrary(records, { config, registry: {}, courseTotals }).flatMap((g) => g.courses);
	const by = (id) => all.find((c) => c.courseId === id).progress;
	assert.deepEqual(by("java"), { basis: "course", done: 2, of: 475, ratio: 2 / 475, label: "<1%", source: "udemy" });
	assert.deepEqual(by("py"), { basis: "started", done: 0, of: 3, ratio: 0, label: "0/3" }, "total incoherente: no se usa");
	assert.deepEqual(by("sql"), { basis: "course", done: 0, of: 4, ratio: 0, label: "0%", source: "datacamp" });
	assert.equal(totals.courseProgress(2, 3, { total: 11, source: "datacamp", at: 1 }).label, "18%", "redondeo hacia abajo: 100% solo si está terminado");
	assert.equal(totals.courseProgress(199, 200, { total: 200, source: "udemy", at: 1 }).label, "99%");
	assert.deepEqual(lib.buildLibrary(records, { config, registry: {} }).flatMap((g) => g.courses).find((c) => c.courseId === "java").progress.label, "2/2", "sin temario: fracción de lo empezado");
});

await test("countManyCards: una sola llamada multi y fallback secuencial", async () => {
	const calls = [];
	const multi = await ops.countManyCards(async (action, params) => {
		calls.push(action);
		if (action === "multi") return params.actions.map((_, i) => i === 1 ? { result: [1, 2, 3] } : i === 0 ? [] : [2, 3]);
		throw new Error("no esperado");
	}, ["a", "b", "c"], { useMulti: true });
	assert.deepEqual(multi, [0, 3, 2]);
	assert.deepEqual(calls, ["multi"], "sin bucle findCards cuando multi responde");

	const fallbackCalls = [];
	const fallback = await ops.countManyCards(async (action, params) => {
		fallbackCalls.push(action);
		if (action === "multi") throw new Error("unsupported");
		return Array.from({ length: params.query.length }, (_, i) => i);
	}, ["aa", "bbb"], { useMulti: true });
	assert.deepEqual(fallback, [2, 3]);
	assert.deepEqual(fallbackCalls, ["multi", "findCards", "findCards"]);
	const sequential = await ops.countManyCards(async (action) => { assert.equal(action, "findCards"); return [1]; }, ["a", "b"]);
	assert.deepEqual(sequential, [1, 1]);
});

await test("búsquedas globales: conceptos, vocabulario, duda y untracked sin vocabulario", () => {
	const conceptQ = lib.allConceptsQuery(config);
	const vocabQ = lib.allVocabQuery(config);
	assert(conceptQ.includes('-note:"Kinema · Vocab · *"'), "conceptos sin vocabulario");
	assert(vocabQ.includes('note:"Kinema · Vocab · *"') && vocabQ.includes('note:"Udemy Bridge Vocab"'));
	assert(lib.courseVocabQuery("Java").includes("tag:kinema::curso::java"));
	const course = lib.buildLibrary(records, { config, registry: {} }).flatMap((g) => g.courses).find((c) => c.courseId === "java");
	const q = lib.courseAnkiQueries(course, config);
	assert(q.doubt.endsWith("tag:kinema::duda") && q.doubt.includes(lib.NOT_VOCAB));
	const untracked = lib.courseUntrackedCardsQuery(course, config);
	assert(untracked && untracked.includes(lib.NOT_VOCAB) && untracked.includes("-tag:kinema::leccion::"));
	assert.equal(lib.LESSON_QUERY_LIMIT, 35);
});

await test("conteos del historial excluyen tarjetas descartadas", () => {
	const legacy = { ankiCardsCount: 5 };
	assert.equal(lib.acceptedCardCount(legacy), 5, "sin array: respeta el campo guardado");
	assert.equal(lib.acceptedCardCount({ ankiCardsCount: 3, ankiCards: [{}, {}, {}, { excluded: true }] }), 3);
});

console.log(`QA unidades de la Biblioteca: ${passed}/${passed} OK`);
