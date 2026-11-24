// Tests puros de la fase 1 de Study (sin navegador): Recordar, plan de
// Comprobar, cobertura de tarjetas, Aplicar estructurado, prompt y nota.
// node scripts/qa-study-units.mjs   (Node ≥ 22.18: importa .ts directamente)
import assert from "node:assert/strict";

const root = new URL("../src/", import.meta.url);
const load = (p) => import(new URL(p, root).href);
const recall = await load("app/services/recallCue.ts");
const plan = await load("app/services/checkPlan.ts");
const cov = await load("app/services/cardCoverage.ts");
const pf = await load("app/services/practiceFormats.ts");
const prompts = await load("shared/prompts.ts");
const obs = await load("app/services/obsidianExport.ts");

let passed = 0;
const test = (name, fn) => {
	try { fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}`); throw error; }
};

// ── Recordar ──────────────────────────────────────────────────────────────
test("Recordar: «Título — detalle» y fallback de sesiones antiguas", () => {
	assert.deepEqual(recall.splitIdea("Qué produce javac — javac compila a bytecode"), { title: "Qué produce javac", detail: "javac compila a bytecode" });
	assert.deepEqual(recall.splitIdea("Qué produce javac – bytecode"), { title: "Qué produce javac", detail: "bytecode" });
	assert.equal(recall.formatRecallPrompt("Qué produce javac"), "¿Qué produce javac?");
	assert.equal(recall.formatRecallPrompt("¿Qué genera javac al compilar?"), "¿Qué genera javac al compilar?");
	assert.deepEqual(recall.splitIdea("Calor residual - sigue cocinándose"), { title: "Calor residual", detail: "sigue cocinándose" });
	assert.deepEqual(recall.splitIdea("Idea central: qué problema resuelve"), { title: "Idea central", detail: "qué problema resuelve" });
	// Sesión antigua: la idea entera es la pista y no hay nada que ocultar.
	const legacy = "javac compila el fuente a bytecode, no a código nativo";
	assert.deepEqual(recall.splitIdea(legacy), { title: legacy, detail: "" });
	assert.deepEqual(recall.splitIdea("try-catch captura excepciones"), { title: "try-catch captura excepciones", detail: "" }, "un guion sin espacios no separa");
	const longTitle = "uno dos tres cuatro cinco seis siete ocho nueve diez — detalle";
	assert.equal(recall.splitIdea(longTitle).detail, "", "un «título» de 10 palabras es la idea entera");
	assert.deepEqual(recall.splitIdea(""), { title: "", detail: "" });
});

test("Recordar: calibración progresiva sin bucles (confianza solo con evidencia reciente)", () => {
	const t = recall.trustsSelfReport;
	assert.equal(t([]), false);
	assert.equal(t(["ok", "ok"]), false, "hacen falta 3 confirmaciones");
	assert.equal(t(["ok", "ok", "ok"]), true);
	assert.equal(t(["skip", "ok", "ok", "ok"]), false, "nunca dos sesiones seguidas sin confirmar");
	assert.equal(t(["ok", "skip", "ok", "ok"]), true, "los skip no cuentan como evidencia");
	assert.equal(t(["fail", "ok", "ok", "ok"]), false, "un fallo reciente la anula");
	assert.equal(t(["ok", "ok", "fail"]), false);
	assert.equal(t([undefined, null, "ok", "ok", "ok"]), true, "sesiones sin dato se ignoran");
	assert.deepEqual([recall.spotBudgetFor(1, false), recall.spotBudgetFor(1, true), recall.spotBudgetFor(0, false), recall.spotBudgetFor(0, true)], [1, 2, 0, 1]);
});

// ── Comprobar ─────────────────────────────────────────────────────────────
test("Comprobar: el presupuesto de confirmaciones cambia el plan (y el defecto es el de antes)", () => {
	const q = (difficulty, conceptRefs) => ({ difficulty, conceptRefs });
	const medium = { keyConcepts: ["a", "b", "c"], questions: [q("confused", [0]), q("partial", [1]), q("clear", [2]), q("mastered", [1, 2])] };
	const total = (checked, budget) => plan.checkPlanState(medium, [1], new Set(checked), budget).total;
	assert.equal(plan.checkPlanState(medium, [1], new Set([0, 2])).total, 2, "defecto = 1 confirmación (compatibilidad)");
	assert.deepEqual([total([0, 2], 0), total([0, 2], 1), total([0, 2], 2)], [1, 2, 3], "0, 1 o 2 confirmaciones");
	// La 2.ª confirmación va a OTRA idea marcada (no repite la ya confirmada).
	const second = plan.pickNextCheckQuestion(medium, [1, 0], new Set([0, 2]), undefined, 2);
	assert.deepEqual(second, { i: 2, kind: "spot" });
	// Las ideas no marcadas se preguntan igual con cualquier presupuesto.
	assert.equal(total([], 0), 3);
	// Releer una cola guardada con su presupuesto.
	assert.deepEqual(plan.orderPresented(medium, 1, [0, 1, 2], new Set([0, 2]), 2), [1, 0, 2]);
});

// ── Fijar: cobertura ──────────────────────────────────────────────────────
const make = (c) => ({ ...c });
test("Fijar: una tarjeta real por idea, desde su pregunta; sin inventar", () => {
	const ideas = ["A — a", "B — b", "C — c", "D — d"];
	const questions = [
		{ q: "¿A?", answer: "a", conceptRefs: [0] },
		{ q: "¿Síntesis?", answer: "s", conceptRefs: [1, 2, 3] },
		{ q: "¿D?", answer: "d <x>", conceptRefs: [3] },
	];
	const cards = [{ id: "card-001", type: "concepto", front: "¿A?", back: "a", tags: [], conceptRefs: [0] }];
	const out = cov.ensureConceptCards(ideas, questions, cards, make);
	assert.deepEqual(out.map((c) => [c.id, c.conceptRefs]), [["card-001", [0]], ["study-cobertura-q1", [1, 2, 3]]], "la síntesis cubre B, C y D a la vez");
	assert.deepEqual(cov.ideasWithoutCard(ideas, out), []);
	// Preferencia: la pregunta de UNA idea antes que la de síntesis.
	const out2 = cov.ensureConceptCards(ideas, questions, [...cards, { id: "c2", type: "concepto", front: "x", back: "y", tags: [], conceptRefs: [1, 2] }], make);
	assert.equal(out2.at(-1).id, "study-cobertura-q2", "D se cubre con su pregunta propia");
	assert(out2.at(-1).back.includes("&lt;x&gt;"), "el dorso se escapa");
	// Determinista: misma entrada → mismas tarjetas; reaplicar no añade nada.
	assert.deepEqual(cov.ensureConceptCards(ideas, questions, out, make), out);
	// Sin pregunta: la idea con detalle se convierte en tarjeta; la antigua sin detalle no se inventa.
	const orphan = cov.ensureConceptCards(["Qué es X — X hace Y", "una idea antigua sin título"], [], [], make);
	assert.deepEqual(orphan.map((c) => [c.id, c.front, c.back]), [["study-cobertura-i0", "¿Qué hay que saber de «Qué es X»?", "<p>X hace Y</p>"]]);
	assert.deepEqual(cov.ideasWithoutCard(["a", "b"], [{ conceptRefs: [0] }, { conceptRefs: [1], excluded: true }]), [1], "las excluidas no cuentan");
	// Una sesión antigua con su tarjeta de refuerzo de la pregunta no se duplica.
	const legacy = cov.ensureConceptCards(ideas, questions, [...cards, { id: "study-refuerzo-q1", type: "concepto", front: "¿Síntesis?", back: "s", tags: [], conceptRefs: [1] }], make);
	assert(!legacy.some((c) => c.id === "study-cobertura-q1"), "misma pregunta = misma nota (GUID «study:»)");
	assert(cov.isStudyCard("study-cobertura-q1") && cov.isStudyCard("study-refuerzo-q0") && !cov.isStudyCard("card-001"));
});

test("Fijar: duplicados fusionados sin perder sus ideas", () => {
	const merged = cov.mergeDuplicateCards([
		{ id: "1", type: "concepto", front: "<b>¿Qué es la JVM?</b>", back: "a", tags: [], conceptRefs: [1] },
		{ id: "2", type: "concepto", front: "¿que es la jvm", back: "b", tags: [], conceptRefs: [0, 2], reinforce: true },
		{ id: "3", type: "concepto", front: "Otra", back: "c", tags: [] },
	]);
	assert.deepEqual(merged.map((c) => [c.id, c.conceptRefs, Boolean(c.reinforce)]), [["1", [0, 1, 2], true], ["3", undefined, false]]);
});

// ── Aplicar ───────────────────────────────────────────────────────────────
const completar = { format: "completar", language: "bash", body: "[[1]] App.java\njava [[2]]", blanks: [{ accept: ["javac"], options: ["javac", "java", "jar"] }, { accept: ["App", "App.class"] }], explanation: "e" };
test("Aplicar: validación de cada formato (o null → ejercicio clásico)", () => {
	assert.equal(pf.parsePractice(completar).format, "completar");
	assert.equal(pf.parsePractice({ ...completar, format: "COMPLETAR" }).format, "completar", "formato sin distinguir mayúsculas");
	assert.equal(pf.parsePractice({ ...completar, body: "[[1]] App.java" }), null, "huecos y marcas no coinciden");
	assert.equal(pf.parsePractice({ ...completar, body: "[[2]] x [[1]]" }), null, "marcas fuera de orden");
	assert.equal(pf.parsePractice({ ...completar, body: "[[1]][[2]][[3]][[4]]", blanks: [1, 2, 3, 4].map(() => ({ accept: ["x"] })) }), null, "más de 3 huecos");
	assert.equal(pf.parsePractice({ ...completar, blanks: [{ accept: [] }, { accept: ["x"] }] }), null, "hueco sin respuesta");
	assert.equal(pf.parsePractice({ ...completar, blanks: [{ accept: ["javac"], options: ["a", "b"] }, { accept: ["x"] }] }).blanks[0].options, undefined, "opciones sin la correcta se descartan");
	assert.equal(pf.parsePractice({ format: "ordenar", steps: ["a", "b", "c"] }).steps.length, 3);
	assert.equal(pf.parsePractice({ format: "ordenar", steps: ["a", "b"] }), null);
	assert.equal(pf.parsePractice({ format: "ordenar", steps: ["a", "A.", "c"] }), null, "pasos repetidos");
	assert.equal(pf.parsePractice({ format: "predecir", body: "print(1)", options: ["1", "2", "3"], answerIndex: "0" }).answerIndex, 0);
	assert.equal(pf.parsePractice({ format: "predecir", body: "", options: ["1", "2"], answerIndex: 0 }), null, "predecir sin nada que predecir");
	assert.equal(pf.parsePractice({ format: "decidir", body: "", options: ["1", "2", "3"], answerIndex: 3 }), null);
	assert.equal(pf.parsePractice({ format: "decidir", body: "", options: ["1", "2", "3"], answerIndex: 2 }).format, "decidir");
	assert.equal(pf.parsePractice({ format: "error", lines: ["a", "b", "c"], errorLine: 1, fixedLine: "B" }).errorLine, 1);
	assert.equal(pf.parsePractice({ format: "error", lines: ["a", "b", "c"], errorLine: 1, fixedLine: "b" }), null, "la corrección no puede ser la misma línea");
	assert.equal(pf.parsePractice({ format: "error", lines: Array(13).fill("x"), errorLine: 0, fixedLine: "y" }), null, "máx. 12 líneas");
	assert.equal(pf.parsePractice({ format: "otro" }), null);
	assert.equal(pf.parsePractice(undefined), null);
});

test("Aplicar: respuestas equivalentes (mayúsculas, espacios, acentos) y código exacto", () => {
	assert.equal(pf.normalizeAnswer("  Ebullición  fuerte. ", false), "ebullicion fuerte");
	assert(pf.sameText("«Al dente»", "al dente", false));
	assert(!pf.sameText("String", "string", true), "en código, String ≠ string");
	assert(pf.sameText("x = 1;", "x=1", true), "en código, espacios y «;» final no importan");
	const p = pf.parsePractice(completar);
	assert(pf.checkBlank(" App.class ", p.blanks[1], true), "varias respuestas aceptadas");
	assert(!pf.checkBlank("", p.blanks[0], true));
	assert.deepEqual(pf.gradePractice(p, { format: "completar", values: ["java", "App"] }, true), { correct: false, parts: [false, true] });
	assert.equal(pf.gradePractice(p, { format: "completar", values: ["javac", "App"] }, true).correct, true);
});

test("Aplicar: ordenar, opciones y error se corrigen sin IA", () => {
	const o = pf.parsePractice({ format: "ordenar", steps: ["uno", "dos", "tres", "cuatro"] });
	const sh = pf.stableShuffle(o.steps);
	assert.deepEqual(sh, pf.stableShuffle(o.steps), "baraja estable");
	assert.notDeepEqual(sh, [0, 1, 2, 3], "nunca llega ya ordenado");
	assert.deepEqual([...sh].sort(), [0, 1, 2, 3]);
	assert.deepEqual(pf.gradePractice(o, { format: "ordenar", order: [0, 2, 1, 3] }, false), { correct: false, parts: [true, false, false, true] });
	assert.equal(pf.gradePractice(o, { format: "ordenar", order: [0, 1, 2] }, false).correct, false, "incompleto no es correcto");
	const d = pf.parsePractice({ format: "decidir", body: "caso", options: ["a", "b", "c"], answerIndex: 1 });
	assert.equal(pf.gradePractice(d, { format: "decidir", choice: 1 }, false).correct, true);
	assert.equal(pf.optionToDiscard(d), 2, "la pista descarta una incorrecta");
	const e = pf.parsePractice({ format: "error", lines: ["a", "b", "c", "d", "e"], errorLine: 4, fixedLine: "E" });
	assert.equal(pf.gradePractice(e, { format: "error", line: 4 }, true).correct, true);
	assert.deepEqual(pf.errorWindow(e), [2, 4], "la pista acota a 3 líneas que contienen la mala");
});

test("Aplicar: pistas, XP y textos para historial y Obsidian", () => {
	const p = pf.parsePractice(completar);
	assert.deepEqual(pf.blankHint(p.blanks[0]).options, ["javac", "java", "jar"]);
	assert.equal(pf.blankHint({ accept: ["Polimorfismo"] }).prefix, "Pol", "primeras letras, nunca la respuesta");
	assert.deepEqual([pf.practiceBonus(1, 0), pf.practiceBonus(1, 1), pf.practiceBonus(2, 0)], [20, 10, 0]);
	assert.equal(pf.summarizePracticeAnswer(p, { format: "completar", values: ["javac", ""] }), "Hueco 1: javac · Hueco 2: —");
	assert.equal(pf.practiceSolutionText(p), "Hueco 1: javac · Hueco 2: App");
	assert.equal(pf.bodyWithGaps(p.body), "____ App.java\njava ____");
	assert.equal(pf.bodyWithAnswers(p), "javac App.java\njava App");
	const md = pf.practiceMarkdown(p, true).join("\n");
	assert(md.includes("**Formato:** Completar · el código") && md.includes("```bash\n____ App.java") && md.includes("> [!example]- Ver solución\n> Hueco 1: javac"), md);
	for (const f of pf.PRACTICE_FORMATS) assert(pf.practiceFormatMeta(f, false).instruction.length < 70, `instrucción corta: ${f}`);
});

// ── Prompt y nota ─────────────────────────────────────────────────────────
test("Prompt: ideas con título, práctica estructurada válida en los ejemplos", () => {
	const prompt = prompts.buildStudyPrompt("palabra ".repeat(400), { courseName: "C", lessonName: "L" });
	assert(/«Título — detalle»/.test(prompt) && /application\.practice/.test(prompt) && /NUNCA pidas escribir una clase/.test(prompt));
	for (const tag of ["EJEMPLO A", "EJEMPLO B"]) {
		const from = prompt.indexOf(tag);
		const chunk = prompt.slice(from, tag === "EJEMPLO A" ? prompt.indexOf("EJEMPLO B") : undefined);
		const json = JSON.parse(chunk.slice(chunk.indexOf("{"), chunk.lastIndexOf("}") + 1));
		assert(json.keyConcepts.every((k) => recall.splitIdea(k).detail), `${tag}: cada idea con título y detalle`);
		assert(pf.parsePractice(json.application.practice), `${tag}: práctica estructurada válida`);
		assert.deepEqual(cov.ideasWithoutCard(json.keyConcepts, json.ankiCards), [], `${tag}: todas las ideas con tarjeta`);
	}
});

test("Obsidian: ideas con título, la práctica y su resultado en la nota", () => {
	const practice = pf.parsePractice(completar);
	const note = obs.buildSessionNoteMarkdown({
		courseName: "Java", lessonName: "JVM",
		unrecalledIdeas: ["Qué hace la JVM — ejecuta el bytecode"],
		spotCheck: "fail",
		practiceResult: { format: "completar", correct: true, attempts: 2, hintsUsed: 1, solutionSeen: false, answer: "Hueco 1: javac" },
		result: { title: "Lección completada", remembered: { count: 1, total: 2 }, check: { firstTry: 1, improved: 0, skipped: false }, practice: "correct", cards: { total: 3, reinforce: 1, destination: "anki" } },
		content: { relevance: { score: 80, reason: "r" }, keyConcepts: ["Qué produce javac — bytecode", "idea antigua"], questions: [], application: { isCode: true, setup: "s", challenge: "c", solution: "x", practice }, interviewQ: null, nextAction: "n", ankiCards: [] },
	}, obs.DEFAULT_OBSIDIAN_EXPORT_CONFIG);
	assert(note.includes("- **Qué produce javac** — bytecode") && note.includes("- idea antigua"), "ideas: título en negrita, las antiguas igual");
	assert(note.includes("**Formato:** Completar") && note.includes("> [!example]- Ver solución") && note.includes("> [!note]- Solución explicada"), "el ejercicio y su clave plegada");
	assert(note.includes("Práctica: correcta · en 2 intentos (Completar)"), "cómo salió la práctica");
	assert(note.includes("Lo que dijiste saber: no se sostuvo del todo"), "la confirmación queda registrada");
	assert(note.includes("No me salieron sin mirar:\n- **Qué hace la JVM** — ejecuta el bytecode"));
	// Sesión antigua: sin práctica estructurada, la solución de siempre.
	const legacy = obs.buildSessionNoteMarkdown({ courseName: "Java", lessonName: "JVM", content: { relevance: { score: 1, reason: "" }, keyConcepts: ["x"], questions: [], application: { isCode: false, setup: "s", challenge: "c", solution: "sol" }, interviewQ: null, nextAction: "", ankiCards: [] } }, obs.DEFAULT_OBSIDIAN_EXPORT_CONFIG);
	assert(legacy.includes("> [!example]- Ver solución\n> sol") && !legacy.includes("**Formato:**"));
});

test("splitIdea: una pregunta larga sigue partiendo; la prosa de 10 palabras no", () => {
	const question = "¿Qué tipo de código Python se va a escribir en el curso? — código idiomático";
	assert(recall.splitIdea(question).detail === "código idiomático", "12 palabras con ¿…? se parten");
	assert(recall.splitIdea("uno dos tres cuatro cinco seis siete ocho nueve diez — detalle").detail === "", "prosa larga intacta");
});

test("Prompts: filtro anti-logística y colocación dentro de la oración", () => {
	const study = prompts.buildStudyPrompt("palabra ".repeat(200), { courseName: "C", lessonName: "L" });
	assert(study.includes("FILTRO DE CONOCIMIENTO TRANSFERIBLE") && study.includes("Regla de los 6 meses"));
	assert(study.includes("PROHIBIDO usar \"ordenar\" para instalaciones de herramientas"));
	assert(study.includes("4-12 palabras"));
	const vocab = prompts.buildVocabularyPrompt("texto", { targetLang: "English", baseLang: "Spanish", minLevel: "B2", words: [] });
	assert(/DEBE usar esa misma colocación exacta/.test(vocab));
	assert(/son C1 o C2, no B2/.test(vocab));
});

test("Obsidian: «1 de 2 a la primera» cuando el historial aporta el total", () => {
	const note = obs.buildSessionNoteMarkdown({
		courseName: "Java", lessonName: "JVM",
		result: { title: "Lección completada", remembered: { count: 1, total: 2 }, check: { firstTry: 1, improved: 0, total: 2, skipped: false }, practice: "correct", cards: { total: 2, reinforce: 0, destination: "anki" } },
		content: { relevance: { score: 80, reason: "r" }, keyConcepts: ["x"], questions: [], application: { isCode: false, setup: "s", challenge: "c", solution: "sol" }, interviewQ: null, nextAction: "n", ankiCards: [] },
	}, obs.DEFAULT_OBSIDIAN_EXPORT_CONFIG);
	assert(note.includes("Comprobación: 1 de 2 a la primera"), note.slice(0, 200));
});

console.log(`QA unidades de Study: ${passed}/${passed} OK`);
