// Tests puros de la fase 2 (Anki): destino único, búsquedas de repasos,
// migración opcional, AnkiConnect (con un Anki simulado) y los .apkg.
// node scripts/qa-anki-units.mjs   (Node ≥ 22.18: importa .ts directamente)
import assert from "node:assert/strict";

const root = new URL("../src/", import.meta.url);
const load = (p) => import(new URL(p, root).href);
const dest = await load("app/services/ankiDestination.ts");
const ops = await load("app/services/ankiConnectOps.ts");
const design = await load("app/services/ankiDesign.ts");
const platform = await load("app/services/platform.ts");

let passed = 0;
const test = async (name, fn) => {
	try { await fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}`); throw error; }
};
const cfg = (extra = {}) => ({ rootDeck: "Kinema", ...extra });

await test("Destino (fase 5): siempre un mazo por curso; la lección, el programa y la plataforma van en etiquetas", () => {
	const d = dest.conceptDestination(cfg(), "Java In-Depth", "What is Java & JVM?");
	assert.deepEqual(d, { deck: "Kinema::Courses::Java In-Depth", owned: true, ancestors: ["Kinema", "Kinema::Courses", "Kinema::Courses::Java In-Depth"] });
	assert.equal(dest.conceptDestination(cfg(), "A::B", "x").deck, "Kinema::Courses::A — B", "«::» en un título no crea submazos");
	// Las opciones de antes ya no cambian el mazo (configs guardadas con ellas).
	assert.equal(dest.conceptDestination(cfg({ conceptLayout: "lesson" }), "Java", "JVM").deck, "Kinema::Courses::Java", "«Por lección» ya no crea submazos");
	assert.equal(dest.conceptDestination(cfg({ groupByProgram: true }), "Intro to SQL", "L1", { program: "Data Analyst" }).deck, "Kinema::Courses::Intro to SQL", "«Por programa» ya no cambia el mazo");
	assert.equal(dest.defaultConceptDeck(cfg({ groupByProgram: true, conceptLayout: "lesson" }), "Intro to SQL", "L1", "Data Analyst"), "Kinema::Courses::Intro to SQL");
});

await test("Destino: un curso, un mazo — el fijado manda (también uno tuyo o uno de una estructura anterior)", () => {
	// Fijado con «Por programa» en una versión anterior: sigue ahí hasta «Ordenar lo antiguo» (no se reparte).
	const assigned = { deck: "Kinema::Programs::Data Analyst::Intro to SQL", program: "Data Analyst", at: 1 };
	assert.equal(dest.conceptDestination(cfg(), "Intro to SQL", "L2", { program: "Data Engineer", assigned }).deck, assigned.deck);
	// Un mazo del estudiante fuera de la raíz: no se declara ningún mazo de Kinema ni se le crean submazos.
	assert.deepEqual(dest.conceptDestination(cfg(), "Java", "JVM", { assigned: { deck: "Mis cursos::Java", at: 1 } }), { deck: "Mis cursos::Java", owned: false, ancestors: [] });
	assert.deepEqual(dest.conceptDestination(cfg({ conceptLayout: "lesson" }), "Java", "JVM", { assigned: { deck: "Mis cursos::Java", at: 1 } }), { deck: "Mis cursos::Java", owned: false, ancestors: [] });
	assert.equal(dest.courseKey("Intro to SQL"), design.kinemaTags({ course: "Intro to SQL", lesson: "" })[0].replace("kinema::curso::", ""), "la clave del registro = la etiqueta del curso");
});

await test("Etiquetas (fase 5): un solo árbol kinema:: — programa (N:M) y plataforma; las antiguas se leen y se renombran", () => {
	const tags = design.kinemaTags({ course: "Intro to SQL", lesson: "Joins", type: "concepto", programs: ["data-analyst-with-sql", "sql-fundamentals"], platform: "datacamp" });
	assert.deepEqual(tags.slice(0, 5), ["kinema::curso::intro-to-sql", "kinema::leccion::joins", "kinema::programa::data-analyst-with-sql", "kinema::programa::sql-fundamentals", "kinema::plataforma::datacamp"]);
	assert(tags.every((t) => t.startsWith("kinema::")), "nada fuera de kinema:: (antes: kinema/platform::…)");
	assert.deepEqual(design.kinemaTags({ course: "Java", lesson: "JVM" }), ["kinema::curso::java", "kinema::leccion::jvm"], "sin programa ni plataforma, como antes");
	assert.deepEqual(design.programsInTags(["kinema::track::data-analyst", "kinema::programa::sql-fundamentals", "kinema::curso::x"]).sort(), ["data-analyst", "sql-fundamentals"], "programas con la etiqueta de ahora o la de antes");
	assert.equal(design.renamedLegacyTag("kinema::track::data-analyst"), "kinema::programa::data-analyst");
	assert.equal(design.renamedLegacyTag("kinema/platform::udemy"), "kinema::plataforma::udemy");
	assert.equal(design.renamedLegacyTag("kinema::curso::x"), null);
	assert.deepEqual(dest.tagMigrationPlan(["kinema/platform::udemy", "kinema::track::da", "kinema::curso::x", "otra", "kinema::programa::ya"]), [
		{ from: "kinema/platform::udemy", to: "kinema::plataforma::udemy" },
		{ from: "kinema::track::da", to: "kinema::programa::da" },
	]);
	assert.equal(dest.programCardsQuery("data-analyst"), "(tag:kinema::programa::data-analyst OR tag:kinema::track::data-analyst)", "repasar un programa entero: etiqueta de ahora o de antes");
	assert.equal(dest.missingProgramTagQuery("Intro to SQL", "sql-fundamentals"), 'note:"Udemy Bridge Concept" tag:kinema::curso::intro-to-sql -tag:kinema::programa::sql-fundamentals', "solo conceptos del curso a los que les falta ESA etiqueta");
});

await test("Destino: vocabulario en un mazo por idioma (o el tuyo); «uno por curso» ya no existe", () => {
	assert.equal(dest.vocabDestination(cfg(), "English", "Java").deck, "Kinema::Vocabulary::English");
	assert.equal(dest.vocabDestination(cfg({ vocabLayout: "course" }), "English", "Java").deck, "Kinema::Vocabulary::English", "la opción de antes ya no crea submazos");
	assert.deepEqual(dest.vocabDestination(cfg({ vocabDeck: "English Cards" }), "English", "Java"), { deck: "English Cards", owned: false, ancestors: [] });
	assert.equal(dest.normalizeDeckName(' A ::  B "x" :: '), "A::B 'x'");
});

await test("Destino (fase 5.1): el mazo de las palabras es POR IDIOMA — uno tuyo para inglés no se lleva el francés", () => {
	const mine = cfg({ vocabDecks: { English: "English Cards" } });
	assert.equal(dest.vocabDestination(mine, "English").deck, "English Cards", "inglés, a tu mazo");
	assert.equal(dest.vocabDestination(mine, "French").deck, "Kinema::Vocabulary::French", "francés, al de Kinema");
	assert.equal(dest.ownVocabDeck(mine, "French"), "", "sin mazo tuyo para francés");
	assert.equal(dest.kinemaVocabDeck(cfg({ rootDeck: "Estudio" }), "German"), "Estudio::Vocabulary::German");
	// Configs de antes: un solo mazo tuyo para todos los idiomas, se sigue leyendo…
	const legacy = cfg({ vocabDeck: "Mis palabras" });
	assert.equal(dest.vocabDestination(legacy, "French").deck, "Mis palabras", "el mazo único de antes vale para los idiomas sin elección propia");
	// …y elegir para UN idioma (también «el de Kinema» = "") manda solo en ese idioma.
	const back = cfg({ vocabDeck: "Mis palabras", vocabDecks: dest.withVocabDeck(legacy, "English", "") });
	assert.equal(dest.vocabDestination(back, "English").deck, "Kinema::Vocabulary::English", "volver al de Kinema en inglés");
	assert.equal(dest.vocabDestination(back, "French").deck, "Mis palabras", "el francés no cambia");
	assert.deepEqual(dest.withVocabDeck(mine, "French", ' Français :: B1 '), { English: "English Cards", French: "Français::B1" }, "cambiar un idioma conserva los demás (nombre normalizado)");
	// «Ordenar lo antiguo»: no toca el vocabulario del idioma que va a un mazo tuyo, sí el de los demás.
	const decks = ["Kinema::Vocabulary::English::Java", "Kinema::Vocabulary::French::Java"];
	assert.deepEqual(dest.migrationPlan(decks, mine).map((m) => m.from), ["Kinema::Vocabulary::French::Java"], "solo el idioma sin mazo tuyo");
});

await test("Repasos: por etiqueta y tipo de nota (más la ruta antigua), con cualquier estructura", () => {
	const lesson = dest.dueQuery("lesson", { rootDeck: "Kinema", course: "Java In-Depth", lesson: "What is Java & JVM?" });
	assert.equal(lesson, '((note:"Udemy Bridge Concept" tag:kinema::curso::java-in-depth tag:kinema::leccion::what-is-java-jvm) OR deck:"Kinema::Courses::Java In-Depth::What is Java & JVM?") -note:"Kinema · Vocab · *" -note:"Udemy Bridge Vocab" is:due');
	const course = dest.dueQuery("course", { rootDeck: "Kinema", course: "Java", courseDeck: "Kinema::Programs::P::Java" });
	assert.equal(course, '((note:"Udemy Bridge Concept" tag:kinema::curso::java) OR deck:"Kinema::Courses::Java" OR deck:"Kinema::Programs::P::Java") -note:"Kinema · Vocab · *" -note:"Udemy Bridge Vocab" is:due', "solo conceptos: el vocabulario se excluye por tipo de nota");
	assert(!dest.dueQuery("course", { rootDeck: "Kinema", course: "Java", courseDeck: "Mis cursos" }).includes("Mis cursos"), "un mazo del estudiante no se cuenta entero");
	assert.equal(dest.dueQuery("all", { rootDeck: "Kinema" }), '(deck:"Kinema" OR tag:kinema::curso::*) is:due');
	assert.equal(dest.ankiSearchValue('a_b*c"d'), 'a\\_b\\*c\\"d', "comodines de Anki escapados");
	assert.equal(dest.lessonNotesQuery("Java", "JVM"), 'note:"Udemy Bridge Concept" tag:kinema::curso::java tag:kinema::leccion::jvm');
});

await test("Ordenar lo antiguo: por lección, por programa y vocabulario por curso → su mazo; registro y mazos vacíos", () => {
	const decks = ["Default", "Kinema", "Kinema::Courses", "Kinema::Courses::Java", "Kinema::Courses::Java::L1", "Kinema::Courses::Java::L2", "Kinema::Courses::Java::L2::Raro",
		"Kinema::Vocabulary", "Kinema::Vocabulary::English", "Kinema::Vocabulary::English::Java", "Otro::Courses::X::Y", "Kinema::Programs", "Kinema::Programs::P", "Kinema::Programs::P::C"];
	const plan = dest.migrationPlan(decks, cfg());
	assert.deepEqual(plan, [
		{ kind: "concepts", from: "Kinema::Courses::Java::L1", to: "Kinema::Courses::Java" },
		{ kind: "concepts", from: "Kinema::Courses::Java::L2", to: "Kinema::Courses::Java" },
		{ kind: "concepts", from: "Kinema::Programs::P::C", to: "Kinema::Courses::C" },
		{ kind: "vocab", from: "Kinema::Vocabulary::English::Java", to: "Kinema::Vocabulary::English" },
	]);
	assert.deepEqual(dest.migrationPlan(decks, cfg({ conceptLayout: "lesson", vocabLayout: "course" })), plan, "las opciones de antes ya no impiden ordenar");
	assert.equal(dest.migrationPlan(decks, cfg({ vocabDeck: "English Cards" })).filter((m) => m.kind === "vocab").length, 0, "con un mazo de vocabulario propio, no se mueve vocabulario");
	assert.deepEqual(dest.prunableParents(plan, cfg()), ["Kinema::Programs::P", "Kinema::Programs"], "los mazos intermedios de «Por programa», del más profundo al más alto");
	const registry = { c: { deck: "Kinema::Programs::P::C", program: "P", at: 1 }, java: { deck: "Kinema::Courses::Java", at: 1 } };
	const next = dest.registryAfterMoves(registry, plan);
	assert.equal(next.c.deck, "Kinema::Courses::C", "el curso fijado en un mazo de programa pasa a su mazo de curso");
	assert.equal(next.java.deck, "Kinema::Courses::Java", "los demás no cambian");
});

// ── Anki simulado: entiende las búsquedas que genera ankiDestination ──
function fakeAnki({ permission = "granted", version = 6, unavailable = false } = {}) {
	const state = { cards: [], notes: [], decks: new Set(["Default"]), media: new Map(), calls: [], failImport: false, onImport: null, mediaDir: "C:\\Users\\Student\\AppData\\Roaming\\Anki2\\Usuario 1\\collection.media", activeImports: 0, maxConcurrent: 0 };
	const unq = (v) => v.replace(/\\(.)/g, "$1");
	const match = (query, card) => {
		const inc = [...query.matchAll(/(^|\s|\()deck:"((?:\\.|[^"\\])*)"/g)].map((m) => unq(m[2]));
		const exc = [...query.matchAll(/-deck:"((?:\\.|[^"\\])*)"/g)].map((m) => unq(m[1]).replace(/::\*$/, ""));
		const tags = [...query.matchAll(/tag:(\S+?)(?=[\s)]|$)/g)].map((m) => m[1]);
		const inDeck = (d) => card.deck === d || card.deck.startsWith(`${d}::`);
		if (exc.some((d) => card.deck.startsWith(`${d}::`))) return false;
		if (inc.length && inc.some(inDeck)) return true;
		return tags.length > 0 && tags.every((t) => card.tags.includes(t));
	};
	const invoke = async (action, params = {}) => {
		state.calls.push(action);
		if (unavailable) throw new Error("fetch failed");
		switch (action) {
			case "requestPermission": if (version < 6) throw new Error("unsupported action"); return { permission, version };
			case "version": return version;
			case "deckNames": return [...state.decks];
			case "findCards": return state.cards.filter((c) => match(params.query, c)).map((c) => c.id);
			case "findNotes": return state.notes.filter((n) => match(params.query, n)).map((n) => n.id);
			case "getMediaDirPath": return state.mediaDir;
			case "storeMediaFile": state.media.set(params.filename, params.data); return params.filename;
			case "deleteMediaFile":
				if (/[\\/]/.test(params.filename)) throw new Error("deleteMediaFile exige solo el basename");
				state.media.delete(params.filename); return null;
			case "importPackage":
				if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(params.path)) throw new Error("importPackage exige ruta absoluta");
				state.activeImports += 1;
				state.maxConcurrent = Math.max(state.maxConcurrent, state.activeImports);
				try {
					if (state.failImport) throw new Error("import failed");
					const name = params.path.split(/[\\/]/).pop();
					if (!state.media.has(name)) throw new Error("el paquete no está en collection.media");
					await state.onImport?.(params.path);
					return true;
				} finally { state.activeImports -= 1; }
			case "changeDeck": state.decks.add(params.deck); for (const c of state.cards) if (params.cards.includes(c.id)) c.deck = params.deck; return null;
			case "deleteDecks": for (const d of params.decks) { if (state.cards.some((c) => c.deck === d || c.deck.startsWith(`${d}::`))) throw new Error("not empty"); state.decks.delete(d); } return null;
			case "notesInfo": return params.notes.map((id) => state.notes.find((n) => n.id === id)).map((n) => ({ noteId: n.id, fields: n.fields }));
			default: throw new Error(`unsupported ${action}`);
		}
	};
	return { state, invoke };
}

await test("AnkiConnect: estado honesto (permiso, versión antigua, Anki cerrado)", async () => {
	assert.deepEqual(await ops.ankiStatus(fakeAnki().invoke), { available: true, permission: "granted", version: 6 });
	assert.equal((await ops.ankiStatus(fakeAnki({ permission: "denied" }).invoke)).permission, "denied");
	assert.deepEqual(await ops.ankiStatus(fakeAnki({ version: 5 }).invoke), { available: true, permission: "granted", version: 5 }, "sin requestPermission: se prueba version");
	const off = await ops.ankiStatus(fakeAnki({ unavailable: true }).invoke);
	assert.equal(off.available, false);
});

await test("AnkiConnect: «Enviar a Anki» importa el mismo .apkg y confirma con datos de Anki", async () => {
	const anki = fakeAnki();
	const q = dest.lessonNotesQuery("Java", "JVM");
	const tags = ["kinema::curso::java", "kinema::leccion::jvm"];
	anki.state.notes.push({ id: 1, tags, deck: "Kinema::Courses::Java" });
	anki.state.onImport = (path) => {
		assert(path.startsWith(anki.state.mediaDir + "\\"), "ruta nativa Windows absoluta dentro de collection.media");
		assert(anki.state.media.has(path.split(/[\\/]/).pop()), "el paquete está en medios al importar");
		anki.state.notes.push({ id: 2, tags, deck: "Kinema::Courses::Java" }, { id: 3, tags, deck: "Kinema::Courses::Java" });
	};
	const r = await ops.importApkg(anki.invoke, { base64: "QUJD", filename: "JVM conceptos.apkg", countQuery: q });
	assert.deepEqual(r, { before: 1, after: 3, added: 2 });
	assert.equal(anki.state.media.size, 0, "el paquete no se queda en la carpeta de medios");
	assert(anki.state.calls.includes("storeMediaFile") && anki.state.calls.includes("importPackage"));
	// Si la importación falla, también se limpia y el error llega a la UI.
	anki.state.failImport = true;
	await assert.rejects(() => ops.importApkg(anki.invoke, { base64: "QUJD", filename: "x.apkg", countQuery: q }), /import failed/);
	assert.equal(anki.state.media.size, 0);
});

await test("AnkiConnect: importPackage usa ruta POSIX y serializa dos envíos simultáneos", async () => {
	const anki = fakeAnki();
	anki.state.mediaDir = "/Users/Student/Library/Application Support/Anki2/Usuario 1/collection.media";
	const q = dest.lessonNotesQuery("Java", "JVM");
	const tags = ["kinema::curso::java"];
	let posixSeen = false;
	anki.state.onImport = (path) => {
		if (path.startsWith("/Users/")) { posixSeen = true; assert(path.includes("/collection.media/")); }
	};
	await Promise.all([
		ops.importApkg(anki.invoke, { base64: "QUJD", filename: "a.apkg", countQuery: q }),
		ops.importApkg(anki.invoke, { base64: "QUJD", filename: "b.apkg", countQuery: q }),
	]);
	assert(posixSeen, "ruta POSIX absoluta aceptada");
	assert.equal(anki.state.maxConcurrent, 1, "los importes nunca se solapan");
	assert.equal(anki.state.media.size, 0, "no quedan paquetes temporales");
});

await test("AnkiConnect: migración opcional conserva tarjetas y solo borra submazos vacíos", async () => {
	const anki = fakeAnki();
	anki.state.cards.push(
		{ id: 1, deck: "Kinema::Courses::Java::L1", tags: [] },
		{ id: 2, deck: "Kinema::Courses::Java::L1", tags: [] },
		{ id: 3, deck: "Kinema::Courses::Java::L2::Raro", tags: [] },
		{ id: 4, deck: "Kinema::Vocabulary::English::Java", tags: [] },
	);
	["Kinema::Courses::Java::L1", "Kinema::Courses::Java::L2", "Kinema::Courses::Java::L2::Raro", "Kinema::Vocabulary::English::Java"].forEach((d) => anki.state.decks.add(d));
	const plan = dest.migrationPlan([...anki.state.decks], cfg());
	const dry = await ops.runMigration(anki.invoke, plan, { dryRun: true });
	assert.deepEqual(dry.map((m) => [m.from, m.cards, m.moved]), [["Kinema::Courses::Java::L1", 2, false], ["Kinema::Courses::Java::L2", 0, false], ["Kinema::Vocabulary::English::Java", 1, false]]);
	assert(anki.state.cards.every((c) => c.deck !== "Kinema::Courses::Java"), "la simulación no mueve nada");
	const real = await ops.runMigration(anki.invoke, plan, { dryRun: false });
	assert.deepEqual(real.map((m) => [m.from, m.cards, m.removed]), [["Kinema::Courses::Java::L1", 2, true], ["Kinema::Courses::Java::L2", 0, false], ["Kinema::Vocabulary::English::Java", 1, true]]);
	assert.deepEqual(anki.state.cards.map((c) => c.deck), ["Kinema::Courses::Java", "Kinema::Courses::Java", "Kinema::Courses::Java::L2::Raro", "Kinema::Vocabulary::English"], "mover conserva cada tarjeta (y su historial)");
	assert(anki.state.decks.has("Kinema::Courses::Java::L2"), "un submazo con hijos no vacíos no se borra");
	assert.equal(await ops.moveCards(anki.invoke, 'deck:"Kinema::Courses::Java"', "Mis cursos::Java"), 3);
});

await test("AnkiConnect (fase 5): etiquetas antiguas renombradas, programa añadido a las del curso y mazos de programa vaciados", async () => {
	// Un Anki mínimo que entiende las búsquedas de etiquetas que genera ankiDestination (incluida la negación).
	const notes = [
		{ id: 1, model: "Udemy Bridge Concept", tags: ["kinema::curso::intro-to-sql", "kinema::track::data-analyst", "kinema/platform::datacamp"], deck: "Kinema::Programs::Data Analyst::Intro to SQL" },
		{ id: 2, model: "Udemy Bridge Concept", tags: ["kinema::curso::intro-to-sql", "kinema::programa::data-analyst"], deck: "Kinema::Courses::Intro to SQL" },
		{ id: 3, model: "Kinema · Vocab · en", tags: ["kinema::curso::intro-to-sql"], deck: "Kinema::Vocabulary::English" },
		{ id: 4, model: "Udemy Bridge Concept", tags: ["kinema::curso::java"], deck: "Kinema::Courses::Java" },
	];
	const calls = [];
	const unq = (v) => v.replace(/\\(.)/g, "$1");
	const has = (n, tag) => n.tags.some((t) => t.toLowerCase() === tag.toLowerCase() || t.toLowerCase().startsWith(`${tag.toLowerCase()}::`));
	const matches = (query, n) => {
		const clauses = [...query.matchAll(/(-?)(tag|note|deck):("(?:\\.|[^"\\])*"|\S+)/g)].map((m) => ({ neg: m[1] === "-", kind: m[2], value: unq(m[3].replace(/^"|"$/g, "")) }));
		return clauses.every(({ neg, kind, value }) => {
			const hit = kind === "tag" ? (value.endsWith("::*") ? n.tags.some((t) => t.startsWith(value.slice(0, -1))) : has(n, value))
				: kind === "note" ? (value.endsWith("*") ? n.model.startsWith(value.slice(0, -1)) : n.model === value)
					: n.deck === value || n.deck.startsWith(`${value}::`);
			return neg ? !hit : hit;
		});
	};
	const decks = new Set(["Kinema", "Kinema::Courses", "Kinema::Programs", "Kinema::Programs::Data Analyst", "Kinema::Programs::Data Analyst::Intro to SQL", "Kinema::Courses::Intro to SQL"]);
	const invoke = async (action, params = {}) => {
		calls.push(action);
		switch (action) {
			case "getTags": return [...new Set(notes.flatMap((n) => n.tags))];
			case "findNotes": return notes.filter((n) => matches(params.query, n)).map((n) => n.id);
			case "findCards": return notes.filter((n) => matches(params.query, n)).map((n) => n.id * 10);
			case "addTags": for (const n of notes) if (params.notes.includes(n.id)) for (const t of params.tags.split(" ")) if (!n.tags.includes(t)) n.tags.push(t); return null;
			case "removeTags": for (const n of notes) if (params.notes.includes(n.id)) n.tags = n.tags.filter((t) => !params.tags.split(" ").includes(t)); return null;
			case "changeDeck": for (const n of notes) if (params.cards.includes(n.id * 10)) n.deck = params.deck; decks.add(params.deck); return null;
			case "deleteDecks": for (const d of params.decks) decks.delete(d); return null;
			default: throw new Error(`unsupported ${action}`);
		}
	};
	// Etiquetas: primero cuenta, solo cambia al confirmar.
	const plan = dest.tagMigrationPlan(await ops.allTags(invoke));
	const dry = await ops.renameTags(invoke, plan, { dryRun: true });
	assert.deepEqual(dry.map((t) => [t.from, t.notes, t.renamed]), [["kinema/platform::datacamp", 1, false], ["kinema::track::data-analyst", 1, false]]);
	assert(!calls.includes("addTags") && !calls.includes("removeTags"), "contar no cambia nada");
	await ops.renameTags(invoke, plan, { dryRun: false });
	assert.deepEqual(notes[0].tags.sort(), ["kinema::curso::intro-to-sql", "kinema::plataforma::datacamp", "kinema::programa::data-analyst"], "las antiguas pasan a kinema::programa / kinema::plataforma");
	// N:M: el curso entra en otro programa → solo sus notas de CONCEPTOS reciben la etiqueta (ni vocabulario ni otros cursos).
	const tagged = await ops.addTagToQuery(invoke, dest.missingProgramTagQuery("Intro to SQL", "sql-fundamentals"), design.programTag("sql-fundamentals"));
	assert.equal(tagged, 2);
	assert(notes[0].tags.includes("kinema::programa::sql-fundamentals") && notes[1].tags.includes("kinema::programa::sql-fundamentals"));
	assert(!notes[2].tags.includes("kinema::programa::sql-fundamentals"), "el vocabulario no lleva programa");
	assert(!notes[3].tags.includes("kinema::programa::sql-fundamentals"), "otro curso no se toca");
	assert.equal(await ops.addTagToQuery(invoke, dest.missingProgramTagQuery("Intro to SQL", "sql-fundamentals"), design.programTag("sql-fundamentals")), 0, "idempotente");
	assert.equal(await ops.addTagToQuery(invoke, "tag:x", "dos etiquetas"), 0, "una sola etiqueta, sin espacios");
	// «Por programa» → su mazo de curso, y los mazos de programa que quedan vacíos se borran.
	const moves = [{ kind: "concepts", from: "Kinema::Programs::Data Analyst::Intro to SQL", to: "Kinema::Courses::Intro to SQL" }];
	const done = await ops.runMigration(invoke, moves, { dryRun: false, prune: dest.prunableParents(moves, cfg()) });
	assert.deepEqual(done.map((m) => [m.cards, m.moved, m.removed]), [[1, true, true]]);
	assert.equal(notes[0].deck, "Kinema::Courses::Intro to SQL", "con su historial (changeDeck)");
	assert(!decks.has("Kinema::Programs::Data Analyst") && !decks.has("Kinema::Programs"), "mazos de programa vacíos, fuera");
});

await test("AnkiConnect: palabras que ya están en Anki (campo word, o el primero)", async () => {
	const anki = fakeAnki();
	anki.state.notes.push(
		{ id: 1, deck: "Kinema::Vocabulary::English", tags: [], fields: { word: { value: "Leak", order: 0 }, sentence: { value: "x", order: 1 } } },
		{ id: 2, deck: "English Cards", tags: [], fields: { Front: { value: "<b>figure out</b>", order: 0 } } },
		{ id: 3, deck: "Otro", tags: [], fields: { Texto: { value: "ignored", order: 0 } } },
		{ id: 4, deck: "English Cards", tags: [], fields: { Palabra: { value: "", order: 0 }, Extra: { value: "Throughput", order: 1 } } },
	);
	// La nota 4 tiene el campo de palabra vacío: no se toma otro campo (podría ser una frase).
	assert.deepEqual((await ops.knownWords(anki.invoke, ["Kinema::Vocabulary::English", "English Cards"])).sort(), ["figure out", "leak"]);
	assert.equal(ops.knownLemma(" <i>Memory&nbsp;Leak</i> "), "memory leak");
});

await test(".apkg de conceptos: el destino decide los mazos; sin destino, como antes", () => {
	const card = { front: "F", back: "B", guid: "g1", tags: ["kinema::curso::java"] };
	const d = dest.conceptDestination(cfg(), "Java", "JVM");
	const spec = design.buildConceptSpec([card], "Java", "JVM", "Kinema", "", d);
	assert.deepEqual(spec.decks.map((x) => x.name), ["Kinema", "Kinema::Courses", "Kinema::Courses::Java"]);
	assert.equal(spec.notes[0].deck, "Kinema::Courses::Java");
	assert(spec.decks.every((x) => x.conf === design.COURSES_PRESET.id), "preset Kinema · Cursos en los mazos de Kinema");
	assert(spec.decks[2].desc.includes("kinema::leccion"), "la descripción dice dónde está la lección");
	const external = design.buildConceptSpec([card], "Java", "JVM", "Kinema", "", { deck: "Mis cursos::Java", owned: false, ancestors: [] });
	assert.deepEqual(external.decks.map((x) => x.name), ["Mis cursos::Java"], "un mazo del estudiante: sin raíz ni ramas de Kinema");
	const legacy = design.buildConceptSpec([card], "Java", "JVM", "Kinema", "");
	assert.equal(legacy.notes[0].deck, "Kinema::Courses::Java::JVM", "sin destino: la estructura antigua (scripts de QA)");
	assert.equal(design.kinemaSlug("Árbol & Ñu"), "arbol-nu");
});

await test("Plataforma: una sola regla para cualquier sitio (etiquetas, notas, historial)", () => {
	const of = platform.platformOf;
	assert.deepEqual(
		["https://www.udemy.com/course/java/learn/lecture/1", "https://campus.datacamp.com/courses/x", "https://www.coursera.org/learn/ml", "https://app.pluralsight.com/a", "https://www.youtube.com/watch?v=1", "http://localhost:5173/", "no es una url"].map((u) => of(u)),
		["udemy", "datacamp", "coursera", "pluralsight", "youtube", "udemy", "web"],
		"las conocidas por su nombre; cualquier otra, por el sitio (la vista previa simula Udemy)",
	);
	assert.deepEqual(["udemy", "datacamp", "coursera", null].map((p) => platform.platformName(p)), ["Udemy", "DataCamp", "Coursera", "la plataforma"]);
	assert.equal(platform.isPlatformId("coursera"), true);
	assert.equal(platform.isPlatformId("<script>"), false, "un valor guardado raro no llega a las etiquetas");
});

await test("Etiquetas: «C++», «C#» y «C» son cursos distintos (y lo guardado antes se sigue leyendo)", () => {
	const slugs = ["C++ Fundamentals", "C# Fundamentals", "C Fundamentals", "Notepad++ Tips", "CompTIA A+"].map(design.kinemaSlug);
	assert.deepEqual(slugs, ["c-plus-plus-fundamentals", "c-sharp-fundamentals", "c-fundamentals", "notepad-plus-plus-tips", "comptia-a-plus"]);
	assert.equal(design.kinemaSlug("Ejercicio #2: Arrays"), "ejercicio-2-arrays", "un «#» suelto no cambia la etiqueta");
	assert.equal(design.kinemaSlug("Java In-Depth: Become a Complete Java Engineer!"), design.legacyKinemaSlug("Java In-Depth: Become a Complete Java Engineer!"), "sin «+»/«#», el slug de siempre");
	const cpp = dest.dueQuery("course", { rootDeck: "Kinema", course: "C++ Fundamentals" });
	assert(cpp.includes("tag:kinema::curso::c-plus-plus-fundamentals") && !/tag:kinema::curso::c-fundamentals\b/.test(cpp), cpp);
	assert(cpp.includes('deck:"Kinema::Courses::C++ Fundamentals"'), "lo ya exportado a su mazo se sigue contando aunque lleve la etiqueta antigua");
	const old = { "c-fundamentals": { deck: "Mis cursos::C++", at: 1 } };
	assert.equal(dest.assignedDeckFor(old, "C++ Fundamentals")?.deck, "Mis cursos::C++", "registro guardado con la clave antigua");
	assert.equal(dest.assignedDeckFor({ ...old, "c-plus-plus-fundamentals": { deck: "Kinema::Courses::C++", at: 2 } }, "C++ Fundamentals")?.deck, "Kinema::Courses::C++", "la clave propia manda");
	assert.equal(dest.assignedDeckFor({}, "C++ Fundamentals"), null);
});

await test("Compatibilidad e idiomas: detección por diseño de tarjeta (Note Type/campos) y aislamiento por idioma", async () => {
	const models = {
		"Kinema · Vocab · English": [...design.VOCAB_FIELDS],
		"English Cards": [...design.VOCAB_FIELDS_BASE],
		"Basic": ["Front", "Back"],
		[design.CONCEPT_MODEL_NAME]: ["Front", "Back", "Leccion", "Fuente", "Tipo"],
	};
	const cards = [
		{ id: 101, noteId: 1, deckName: "Mi Inglés Diario", model: "Kinema · Vocab · English", word: "resilient" },
		{ id: 102, noteId: 2, deckName: "English Cards", model: "English Cards", word: "seamless" },
		{ id: 103, noteId: 3, deckName: "Mis cursos::Java", model: "Basic", word: "JVM" },
	];
	const invoke = async (action, params = {}) => {
		if (action === "deckNames") return ["Default", "English Cards", "Kinema::Courses::Java", "Mi Inglés Diario", "Mis cursos::Java"];
		if (action === "modelNames") return Object.keys(models);
		if (action === "modelFieldNames") return models[params.modelName] ?? [];
		if (action === "findCards") {
			const m = String(params.query || "").match(/^note:"(.+)"$/);
			const model = m ? m[1] : "";
			return cards.filter((c) => c.model === model).map((c) => c.id);
		}
		if (action === "cardsInfo") {
			const want = new Set(params.cards ?? []);
			return cards.filter((c) => want.has(c.id)).map((c) => ({ deckName: c.deckName }));
		}
		if (action === "findNotes") {
			const q = String(params.query || "");
			const mNote = q.match(/^note:"(.+)"$/);
			if (mNote) return cards.filter((c) => c.model === mNote[1]).map((c) => c.noteId);
			const mDeck = q.match(/^deck:"(.+)"$/);
			if (mDeck) return cards.filter((c) => c.deckName === mDeck[1]).map((c) => c.noteId);
			return [];
		}
		if (action === "notesInfo") {
			const want = new Set(params.notes ?? []);
			return cards.filter((c) => want.has(c.noteId)).map((c) => ({ fields: { word: { value: c.word, order: 0 } } }));
		}
		return [];
	};

	const enInspection = await ops.inspectVocabDecks(invoke, { langCode: "en", langLabel: "English", rootDeck: "Kinema" });
	assert.equal(enInspection.detectedKinemaDeck, "Mi Inglés Diario", "detecta el mazo de Kinema aunque el usuario lo haya renombrado");
	assert.deepEqual(
		enInspection.compatibleDecks.map((d) => [d.deck, d.reason]),
		[["Mi Inglés Diario", "kinema"], ["English Cards", "compatible"]],
		"solo muestra mazos compatibles por diseño; excluye Default y Mis cursos::Java",
	);

	const frInspection = await ops.inspectVocabDecks(invoke, { langCode: "fr", langLabel: "French", rootDeck: "Kinema" });
	assert.equal(frInspection.detectedKinemaDeck, null, "en francés no confunde el mazo de inglés");
	assert.deepEqual(frInspection.compatibleDecks, [], "en francés no sugiere English Cards");

	// Aunque el mazo se haya renombrado, knownWords con langCode encuentra las palabras por Note Type.
	const wordsInEn = await ops.knownWords(invoke, ["Kinema::Vocabulary::English"], { langCode: "en" });
	assert.deepEqual(wordsInEn, ["resilient"], "encuentra palabras de Kinema aunque el mazo original se haya renombrado");

	// knownDecksFor aísla mazos conocidos por idioma.
	const base = { knownDecks: ["English Cards"] };
	assert.deepEqual(dest.knownDecksFor(base, "en"), ["English Cards"]);
	assert.deepEqual(dest.knownDecksFor(base, "fr"), [], "los mazos conocidos de inglés no contaminan francés");
	const updatedFr = dest.withKnownDecks(base, "fr", ["Francés B2"]);
	assert.deepEqual(dest.knownDecksFor(updatedFr, "fr"), ["Francés B2"]);
	assert.deepEqual(dest.knownDecksFor(updatedFr, "en"), ["English Cards"], "inglés intacto al cambiar francés");

	// Diseño único de tarjeta de vocabulario (1 palabra = 1 tarjeta frente + reverso, sin segunda plantilla Producir).
	const vocabModel = design.buildVocabModel("en");
	assert.equal(vocabModel.templates.length, 1, "una sola plantilla completa por palabra");
	assert(vocabModel.templates[0].qfmt.includes("cloze-gap") && vocabModel.templates[0].afmt.includes("bilingualField"), "frente con cloze y reverso completo");
});

console.log(`QA unidades de Anki: ${passed}/${passed} OK`);
