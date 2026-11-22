// Verificación con el MOTOR REAL de Anki (paquete `anki` de Python, el mismo
// código Rust que usa Anki de escritorio y AnkiConnect en findCards): las
// búsquedas de la Biblioteca y de los repasos pendientes cuentan lo que dicen.
//
// Node calcula mazos, etiquetas y búsquedas con el código TS de Kinema (sin
// copiarlos); Python crea una colección nueva, pone cada tarjeta en su estado
// RESPONDIENDO con el planificador (no tocando columnas a mano) y ejecuta las
// búsquedas con col.find_cards.
//
//   python3 -m pip install anki          (o ANKI_PYTHONPATH=/ruta/a/site-packages)
//   node scripts/qa-anki-real-search.mjs
//
// Sin el paquete `anki` imprime SKIP (no finge un resultado).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const root = new URL("../src/", import.meta.url);
const lib = await import(new URL("app/services/library.ts", root).href);
const dest = await import(new URL("app/services/ankiDestination.ts", root).href);
const design = await import(new URL("app/services/ankiDesign.ts", root).href);

const env = { ...process.env, ...(process.env.ANKI_PYTHONPATH ? { PYTHONPATH: process.env.ANKI_PYTHONPATH } : {}) };
const probe = spawnSync("python3", ["-c", "import anki.collection, anki.buildinfo as b; print(b.version)"], { env, encoding: "utf8" });
if (probe.status !== 0) {
	console.log("SKIP qa-anki-real-search: falta el paquete `anki` de Python (python3 -m pip install anki, o ANKI_PYTHONPATH).");
	process.exit(0);
}
const ankiVersion = probe.stdout.trim();

// ── Fixture, con los nombres que produce Kinema ─────────────────────────────
const config = { rootDeck: "Kinema" };
const JAVA = "Java In-Depth: Become a Complete Java Engineer!";
const JVM = "What is Java & JVM?";
const TYPES = "Data Types";
const PY = "Introduction to Python";
const SQL = "SQL_Basics*"; // «_» y «*» son comodines en Anki: su mazo debe ir escapado
const R = "Introduction to R";
const CPP = "C++ Fundamentals";
const C = "C Fundamentals";
const javaDeck = dest.conceptDestination(config, JAVA, "").deck;
const legacyLessonDeck = ["Kinema", "Courses", design.sanitizeDeckSegment(JAVA), design.sanitizeDeckSegment(JVM)].join("::");
const pyDeck = dest.conceptDestination(config, PY, "", { assigned: { deck: "Kinema::Mío", at: 1 } });
const sqlDeck = dest.conceptDestination(config, SQL, "", { assigned: { deck: "Kinema::SQL_Basics*", at: 1 } });
const rDeck = dest.conceptDestination(config, R, "", { assigned: { deck: "Mis cursos::R", at: 1 } });
const cppDeck = dest.conceptDestination(config, CPP, "");
const cDeck = dest.conceptDestination(config, C, "");
const vocabDeck = dest.vocabDestination(config, "English", JAVA).deck;
assert.equal(pyDeck.owned, true);
assert.equal(sqlDeck.owned, true);
assert.equal(rDeck.owned, false);

const CONCEPT = design.CONCEPT_MODEL_NAME;
const VOCAB = design.vocabModelName("en");
const VOCAB_OLD = design.VOCAB_MODEL_NAME_LEGACY;
const tags = (course, lesson, extra = {}) => design.kinemaTags({ course, lesson, type: "concepto", ...extra });

// Cada tarjeta: modelo, mazo, etiquetas y la secuencia de respuestas que la deja en su estado.
const notes = [
	{ id: "J1", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, JVM, { reinforce: true }), steps: [] }, // nueva
	{ id: "J2", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, JVM), steps: ["again"] }, // aprendiendo (paso de 1 min)
	{ id: "J3", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, TYPES), steps: ["easy", "due-today"] }, // repaso, toca hoy
	{ id: "J4", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, TYPES), steps: ["easy"] }, // repaso, no toca hoy
	{ id: "J5", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, JVM, { reinforce: true }), steps: ["easy", "due-today", "again"] }, // reaprendiendo
	{ id: "J6", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, TYPES), steps: ["easy", "due-today", "again", "suspend"] }, // reaprendiendo suspendida
	{ id: "J7", model: CONCEPT, deck: legacyLessonDeck, tags: [], steps: [] }, // versión antigua: sin etiquetas, en el submazo de la lección
	{ id: "J8", model: VOCAB, deck: javaDeck, tags: tags(JAVA, JVM), steps: [] }, // vocabulario en el mazo del curso: NO cuenta
	{ id: "J9", model: VOCAB_OLD, deck: javaDeck, tags: [], steps: ["again"] }, // vocabulario antiguo: NO cuenta
	{ id: "J10", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, TYPES), steps: ["interday", "again"] }, // aprendiendo entre días (paso de 1 día)
	{ id: "J11", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, TYPES), steps: ["bury"] }, // nueva enterrada
	{ id: "J12", model: CONCEPT, deck: javaDeck, tags: tags(JAVA, TYPES), steps: ["again", "suspend"] }, // aprendiendo suspendida
	{ id: "JV", model: VOCAB, deck: vocabDeck, tags: tags(JAVA, JVM), steps: [] }, // vocabulario en su mazo
	{ id: "P1", model: CONCEPT, deck: pyDeck.deck, tags: tags(PY, "Variables"), steps: [] },
	{ id: "P2", model: VOCAB, deck: pyDeck.deck, tags: tags(PY, "Variables"), steps: [] }, // mismo mazo propio que el curso: NO cuenta
	{ id: "P3", model: "Basic", deck: pyDeck.deck, tags: [], steps: [] }, // mazo propio de Kinema: cuenta entero (diseño)
	{ id: "S1", model: CONCEPT, deck: sqlDeck.deck, tags: tags(SQL, "Select"), steps: ["again"] },
	{ id: "S2", model: "Basic", deck: "Kinema::SQLxBasics", tags: [], steps: [] }, // casaría con «SQL_Basics*» sin escapar: NO cuenta
	{ id: "R1", model: CONCEPT, deck: rDeck.deck, tags: tags(R, "Vectors"), steps: [] },
	{ id: "R2", model: "Basic", deck: rDeck.deck, tags: [], steps: [] }, // mazo del estudiante: lo suyo NO cuenta
	{ id: "CPP1", model: CONCEPT, deck: cppDeck.deck, tags: tags(CPP, "Pointers"), steps: [] },
	{ id: "C1", model: CONCEPT, deck: cDeck.deck, tags: tags(C, "Pointers"), steps: ["again"] }, // «C» y «C++»: cursos distintos
];
const withoutExclusion = (q) => q.replace(` ${dest.NOT_VOCAB}`, "");

const javaCourse = { courseName: JAVA, deck: dest.conceptDestination(config, JAVA, "") };
const queries = {
	java: lib.courseAnkiQueries(javaCourse, config),
	javaRaw: { cards: withoutExclusion(dest.kinemaCardsQuery("course", { rootDeck: "Kinema", course: JAVA, courseDeck: javaDeck })) },
	jvm: lib.lessonAnkiQueries({ courseName: JAVA, lectureName: JVM }, config),
	py: lib.courseAnkiQueries({ courseName: PY, deck: pyDeck }, config),
	pyRaw: { cards: withoutExclusion(dest.kinemaCardsQuery("course", { rootDeck: "Kinema", course: PY, courseDeck: pyDeck.deck })) },
	sql: lib.courseAnkiQueries({ courseName: SQL, deck: sqlDeck }, config),
	r: lib.courseAnkiQueries({ courseName: R, deck: rDeck }, config),
	cpp: lib.courseAnkiQueries({ courseName: CPP, deck: cppDeck }, config),
	c: lib.courseAnkiQueries({ courseName: C, deck: cDeck }, config),
	pendingJava: { due: dest.dueQuery("course", { rootDeck: "Kinema", course: JAVA, courseDeck: javaDeck }) },
	semantics: {
		learnAll: `${dest.kinemaCardsQuery("course", { rootDeck: "Kinema", course: JAVA, courseDeck: javaDeck })} is:learn`,
		newAll: `${dest.kinemaCardsQuery("course", { rootDeck: "Kinema", course: JAVA, courseDeck: javaDeck })} is:new`,
	},
};

// ── Python: colección real + planificador real + find_cards ────────────────
const python = String.raw`
import json, os, sys, tempfile
from anki.collection import Collection
from anki.scheduler_pb2 import CardAnswer
spec = json.load(sys.stdin)
col = Collection(os.path.join(tempfile.mkdtemp(), "qa.anki2"))
basic = col.models.by_name("Basic")
def model(name):
    m = col.models.by_name(name)
    if m: return m
    m = col.models.copy(basic, add=False); m["name"] = name; col.models.add_dict(m)
    return col.models.by_name(name)
interday = col.decks.add_config_returning_id("qa-interday")
conf = col.decks.get_config(interday); conf["new"]["delays"] = [1440.0]; col.decks.update_config(conf)
def answer(cid, rating):
    card = col.get_card(cid); card.start_timer()
    states = col._backend.get_scheduling_states(cid)
    col.sched.answer_card(col.sched.build_answer(card=card, states=states, rating=rating))
ids, state = {}, {}
for n in spec["notes"]:
    did = col.decks.id(n["deck"])
    note = col.new_note(model(n["model"]))
    note["Front"] = n["id"]; note["Back"] = n["id"]; note.tags = n["tags"]
    col.add_note(note, did)
    cid = note.cards()[0].id
    ids[n["id"]] = cid
    for step in n["steps"]:
        if step == "again": answer(cid, CardAnswer.AGAIN)
        elif step == "easy": answer(cid, CardAnswer.EASY)
        elif step == "due-today": col.sched.set_due_date([cid], "0")
        elif step == "suspend": col.sched.suspend_cards([cid])
        elif step == "bury": col.sched.bury_cards([cid], manual=True)
        elif step == "interday":
            d = col.decks.get(did); d["conf"] = interday; col.decks.save(d)
    c = col.get_card(cid)
    state[n["id"]] = {"type": int(c.type), "queue": int(c.queue)}
    if "interday" in n["steps"]:
        d = col.decks.get(did); d["conf"] = 1; col.decks.save(d)
names = {v: k for k, v in ids.items()}
out = {}
for group, qs in spec["queries"].items():
    out[group] = {}
    for key, q in qs.items():
        out[group][key] = sorted(names[c] for c in col.find_cards(q) if c in names)
print(json.dumps({"state": state, "found": out}))
col.close()
`;
const run = spawnSync("python3", ["-c", python], { env, input: JSON.stringify({ notes, queries }), encoding: "utf8", maxBuffer: 1 << 24 });
if (run.status !== 0) { console.error(run.stderr); process.exit(1); }
const { state, found } = JSON.parse(run.stdout);

let passed = 0;
const test = (name, fn) => {
	try { fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}\n${JSON.stringify({ state, found }, null, 1)}`); throw error; }
};

test("los estados los pone el planificador de Anki (type/queue reales)", () => {
	// type: 0 nueva · 1 aprendiendo · 2 repaso · 3 reaprendiendo — queue: 1 aprendiendo (intradía) · 3 aprendiendo entre días · -1 suspendida
	assert.deepEqual(state.J2, { type: 1, queue: 1 });
	assert.deepEqual(state.J5, { type: 3, queue: 1 });
	assert.deepEqual(state.J6, { type: 3, queue: -1 });
	assert.deepEqual(state.J10, { type: 1, queue: 3 });
	assert.deepEqual(state.J3, { type: 2, queue: 2 });
});
test("curso: total sin vocabulario, con lo antiguo y lo suspendido", () => {
	assert.deepEqual(found.java.cards, ["J1", "J10", "J11", "J12", "J2", "J3", "J4", "J5", "J6", "J7"]);
	assert(found.javaRaw.cards.includes("J8") && found.javaRaw.cards.includes("J9"), "sin la exclusión, el vocabulario del mismo mazo se colaba");
});
test("nuevas activas: is:new sin suspendidas ni enterradas", () => assert.deepEqual(found.java.fresh, ["J1", "J7"]));
test("aprendiendo = is:learn -is:review (tipo aprendizaje): intradía y entre días; activas", () => assert.deepEqual(found.java.learning, ["J10", "J2"]));
test("reaprendiendo = is:learn is:review (tipo reaprendizaje): solo las olvidadas en un repaso; activas", () => assert.deepEqual(found.java.relearning, ["J5"]));
test("suspendidas aparte: cuentan en el total, no en el desglose", () => assert.deepEqual(found.java.suspended, ["J12", "J6"]));
test("Anki: is:learn/is:review van por TIPO e incluyen suspendidas y enterradas (por eso el filtro de activas)", () => {
	assert.deepEqual(found.semantics.learnAll, ["J10", "J12", "J2", "J5", "J6"]);
	assert.deepEqual(found.semantics.newAll, ["J1", "J11", "J7"]);
});
test("para hoy = is:due: repaso de hoy + pasos de aprendizaje vencidos; no las de mañana ni las suspendidas", () => assert.deepEqual(found.java.due, ["J2", "J3", "J5"]));
test("refuerzo = tag:kinema::reforzar", () => assert.deepEqual(found.java.reinforce, ["J1", "J5"]));
test("lección: por etiqueta y por su submazo antiguo; pendientes de la lección", () => {
	assert.deepEqual(found.jvm.cards, ["J1", "J2", "J5", "J7"]);
	assert.deepEqual(found.jvm.due, ["J2", "J5"]);
});
test("mazo propio de Kinema compartido con vocabulario: cuenta entero salvo el vocabulario", () => {
	assert.deepEqual(found.py.cards, ["P1", "P3"]);
	assert.deepEqual(found.pyRaw.cards, ["P1", "P2", "P3"]);
});
test("mazo propio con «_» y «*» en el nombre: escapados, no se cuela otro mazo", () => {
	assert.deepEqual(found.sql.cards, ["S1"]);
	assert.deepEqual(found.sql.learning, ["S1"]);
});
test("mazo del estudiante: solo las tarjetas de Kinema del curso, no las suyas", () => assert.deepEqual(found.r.cards, ["R1"]));
test("«C++» y «C»: cada curso cuenta solo lo suyo", () => {
	assert.deepEqual(found.cpp.cards, ["CPP1"]);
	assert.deepEqual(found.c.cards, ["C1"]);
});
test("repasos pendientes (dueQuery) y Biblioteca coinciden en conceptos", () => {
	assert.deepEqual(found.pendingJava.due, found.java.due);
});

console.log(`QA búsquedas en Anki real (anki ${ankiVersion}): ${passed}/${passed} OK`);
