// Fase 4 · «Repasar hoy en Anki» con el MOTOR REAL de Anki (paquete `anki` de
// Python, el mismo código Rust que usa AnkiConnect): las funciones REALES de
// Kinema (ankiConnectOps.conceptNotes / noteReviewStates / rescheduleToday)
// hablan con una colección real a través de un puente JSON por stdin/stdout
// que implementa findNotes, notesInfo, findCards y setDueDate como AnkiConnect.
//
// Estados puestos RESPONDIENDO con el planificador (no tocando columnas), con
// FSRS activado y sin él. Comprueba: qué se puede adelantar (solo en repaso y
// activas), que las demás no se tocan y qué hace setDueDate "0" (sin «!»):
// sigue en repaso y conserva su historial; sin FSRS conserva el intervalo; con
// FSRS conserva la memoria (estabilidad) y el intervalo pasa a los días reales
// desde el último repaso (no a 0).
//
//   python3 -m pip install anki          (o ANKI_PYTHONPATH=/ruta/a/site-packages)
//   node scripts/qa-deck-real-anki.mjs
//
// Sin el paquete `anki` imprime SKIP (no finge un resultado).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";

const root = new URL("../src/", import.meta.url);
const ops = await import(new URL("app/services/ankiConnectOps.ts", root).href);
const dest = await import(new URL("app/services/ankiDestination.ts", root).href);
const concepts = await import(new URL("app/services/deckConcepts.ts", root).href);
const design = await import(new URL("app/services/ankiDesign.ts", root).href);

const env = { ...process.env, ...(process.env.ANKI_PYTHONPATH ? { PYTHONPATH: process.env.ANKI_PYTHONPATH } : {}) };
const probe = spawnSync("python3", ["-c", "import anki.collection, anki.buildinfo as b; print(b.version)"], { env, encoding: "utf8" });
if (probe.status !== 0) {
	console.log("SKIP qa-deck-real-anki: falta el paquete `anki` de Python (python3 -m pip install anki, o ANKI_PYTHONPATH).");
	process.exit(0);
}
const ankiVersion = probe.stdout.trim();

const COURSE = "Java In-Depth: Become a Complete Java Engineer!";
const LESSON = "Arquitectura de la JVM";
const CONCEPT = design.CONCEPT_MODEL_NAME;
const tags = design.kinemaTags({ course: COURSE, lesson: LESSON, type: "concepto" });
const deck = dest.conceptDestination({ rootDeck: "Kinema" }, COURSE, "").deck;
// Cada nota: modelo y la secuencia que la deja en su estado.
const notes = [
	{ id: "R1", model: CONCEPT, steps: ["easy"] }, // en repaso, no toca hoy → la ÚNICA que se adelanta
	{ id: "N1", model: CONCEPT, steps: [] }, // nueva
	{ id: "L1", model: CONCEPT, steps: ["again"] }, // aprendiendo
	{ id: "RL", model: CONCEPT, steps: ["easy", "due-today", "again"] }, // reaprendiendo (is:review e is:learn)
	{ id: "S1", model: CONCEPT, steps: ["easy", "suspend"] }, // en repaso, suspendida
	{ id: "B1", model: CONCEPT, steps: ["easy", "bury-today"] }, // en repaso, enterrada hoy (al cambiar de día Anki desentierra)
	{ id: "D1", model: CONCEPT, steps: ["easy", "due-today"] }, // en repaso, ya toca hoy
	{ id: "X1", model: "Basic", steps: ["easy"] }, // en repaso, pero no es de Kinema
	{ id: "V1", model: design.vocabModelName("en"), steps: ["easy"] }, // vocabulario del mismo curso: no es concepto
	// Otros cursos (para la lectura entre cursos): uno sin relación y otro cuyo nombre EMPIEZA como este.
	...[["O1", "Intro to SQL", "Select"], ["P2", `${COURSE} Part 2`, "Generics"]].map(([id, course, lesson]) => ({
		id, model: CONCEPT, steps: [], lesson,
		tags: design.kinemaTags({ course, lesson, type: "concepto" }),
		deck: dest.conceptDestination({ rootDeck: "Kinema" }, course, "").deck,
	})),
];

// Puente: una colección por ejecución; peticiones JSON línea a línea, como AnkiConnect.
const python = String.raw`
import json, os, sys, tempfile
from anki.collection import Collection
from anki.scheduler_pb2 import CardAnswer
spec = json.loads(sys.stdin.readline())
path = os.path.join(tempfile.mkdtemp(), "qa.anki2")
col = Collection(path)
if spec["fsrs"]: col.set_config("fsrs", True)
basic = col.models.by_name("Basic")
def model(name):
    m = col.models.by_name(name)
    if m: return m
    m = col.models.copy(basic, add=False); m["name"] = name
    if name == spec["concept"]: col.models.add_field(m, col.models.new_field("Leccion"))
    col.models.add_dict(m)
    return col.models.by_name(name)
def answer(cid, rating):
    card = col.get_card(cid); card.start_timer()
    col.sched.answer_card(col.sched.build_answer(card=card, states=col._backend.get_scheduling_states(cid), rating=rating))
later = []
ids = {}
for n in spec["notes"]:
    m = model(n["model"])
    note = col.new_note(m)
    note["Front"] = "<p>" + n["id"] + "</p>"; note["Back"] = n["id"]
    if "Leccion" in note: note["Leccion"] = n.get("lesson") or spec["lesson"]
    note.tags = n.get("tags") or spec["tags"]
    col.add_note(note, col.decks.id(n.get("deck") or spec["deck"]))
    cid = note.cards()[0].id
    ids[n["id"]] = {"note": note.id, "card": cid}
    for step in n["steps"]:
        if step == "again": answer(cid, CardAnswer.AGAIN)
        elif step == "easy": answer(cid, CardAnswer.EASY)
        elif step == "due-today": col.sched.set_due_date([cid], "0")
        elif step == "suspend": col.sched.suspend_cards([cid])
        elif step == "bury": col.sched.bury_cards([cid], manual=True)
        elif step == "bury-today": later.append(("bury", cid))
# «Pasa 1 día» para todas (el primer intervalo, con fuzz, nunca baja de 2): la colección, el registro de repasos y la fecha del último repaso (FSRS) retroceden.
crt = col.db.scalar("select crt from col")
col.db.execute("update col set crt = ?", crt - 86400)
col.db.execute("update revlog set id = id - ?", 86400000)
for (cid, data) in col.db.all("select id, data from cards"):
    d = json.loads(data or "{}")
    if "lrt" in d:
        d["lrt"] -= 86400
        col.db.execute("update cards set data = ? where id = ?", json.dumps(d), cid)
col.close()
col = Collection(path)
_ = col.sched.today  # el cambio de día (y su «desenterrar») ocurre aquí, antes de enterrar
for item in later:
    if isinstance(item, tuple) and item[0] == "bury": col.sched.bury_cards([item[1]], manual=True)
def snapshot():
    out = {}
    for k, v in ids.items():
        c = col.get_card(v["card"])
        out[k] = {"type": int(c.type), "queue": int(c.queue), "due": int(c.due), "ivl": int(c.ivl),
                  "s": round(c.memory_state.stability, 4) if c.memory_state else None}
    return out
print(json.dumps({"ready": True, "ids": ids, "today": col.sched.today, "state": snapshot()}), flush=True)
for line in sys.stdin:
    req = json.loads(line)
    try:
        a, p = req["action"], req.get("params") or {}
        if a == "findNotes": res = list(col.find_notes(p["query"]))
        elif a == "findCards": res = list(col.find_cards(p["query"]))
        elif a == "notesInfo":
            res = []
            for nid in p["notes"]:
                note = col.get_note(nid)
                res.append({"noteId": nid, "tags": note.tags, "fields": {name: {"value": note[name], "order": i} for i, name in enumerate(note.keys())}})
        elif a == "setDueDate": col.sched.set_due_date(p["cards"], p["days"]); res = True
        elif a == "__state": res = {"state": snapshot(), "today": col.sched.today}
        else: raise Exception("acción " + a)
        print(json.dumps({"id": req["id"], "result": res}), flush=True)
    except Exception as e:
        print(json.dumps({"id": req["id"], "error": str(e)}), flush=True)
col.close()
`;

async function withAnki(fsrs, fn) {
	const child = spawn("python3", ["-c", python], { env, stdio: ["pipe", "pipe", "inherit"] });
	const lines = readline.createInterface({ input: child.stdout });
	const pending = new Map();
	let ready;
	const readyP = new Promise((r) => { ready = r; });
	lines.on("line", (line) => {
		const msg = JSON.parse(line);
		if (msg.ready) return ready(msg);
		const p = pending.get(msg.id);
		pending.delete(msg.id);
		if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
	});
	child.stdin.write(`${JSON.stringify({ fsrs, notes, tags, deck, lesson: LESSON, concept: CONCEPT })}\n`);
	const setup = await readyP;
	let seq = 0;
	const log = [];
	const invoke = (action, params = {}) => new Promise((resolve, reject) => {
		const id = ++seq;
		if (!action.startsWith("__")) log.push({ action, params });
		pending.set(id, { resolve, reject });
		child.stdin.write(`${JSON.stringify({ id, action, params })}\n`);
	});
	try { return await fn({ invoke, log, setup }); }
	finally { child.stdin.end(); await new Promise((r) => child.on("close", r)); }
}

let passed = 0;
const test = async (name, fn) => {
	try { await fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}`); throw error; }
};

for (const fsrs of [true, false]) {
	const mode = fsrs ? "FSRS" : "SM-2";
	await withAnki(fsrs, async ({ invoke, log, setup }) => {
		const byNote = Object.fromEntries(Object.entries(setup.ids).map(([k, v]) => [v.note, k]));
		const nid = (k) => setup.ids[k].note;
		await test(`${mode} · los estados los pone el planificador (type/queue reales)`, () => {
			const s = setup.state;
			assert.deepEqual([s.R1.type, s.R1.queue], [2, 2], "en repaso");
			assert.deepEqual([s.N1.type, s.L1.type, s.RL.type, s.S1.queue, s.B1.queue], [0, 1, 3, -1, -3]);
			assert(s.R1.due > setup.today, "R1 aún no toca hoy");
			assert(s.D1.due <= setup.today, "D1 ya toca");
		});
		await test(`${mode} · el mazo del curso (la búsqueda real de la Biblioteca): sin vocabulario, con su lección`, async () => {
			const query = dest.kinemaCardsQuery("course", { rootDeck: "Kinema", course: COURSE, courseDeck: deck });
			const found = await ops.conceptNotes(invoke, query);
			// La misma búsqueda que la Biblioteca: el mazo propio de Kinema cuenta entero (también una nota Basic tuya en él), sin el vocabulario.
			assert.deepEqual(found.map((n) => byNote[n.id]).sort(), ["B1", "D1", "L1", "N1", "R1", "RL", "S1", "X1"], "sin el vocabulario");
			assert(found.filter((n) => byNote[n.id] !== "X1").every((n) => n.lesson === LESSON && n.front.startsWith("<p>") && n.tags.includes(`kinema::leccion::${design.kinemaSlug(LESSON)}`)));
		});
		await test(`${mode} · los demás cursos (solo lectura): la búsqueda real ve los otros cursos y no este, ni confunde un curso cuyo nombre empieza igual`, async () => {
			log.length = 0;
			const others = await ops.conceptNotes(invoke, dest.otherCoursesConceptsQuery(COURSE));
			assert.deepEqual(others.map((n) => byNote[n.id]).sort(), ["O1", "P2"], "ni este curso, ni Basic, ni vocabulario");
			const entries = concepts.conceptsFromAnki(others, [], { courseNames: { [design.kinemaSlug("Intro to SQL")]: "Intro to SQL" } });
			const scope = { course: COURSE, lesson: LESSON, program: null };
			assert.deepEqual(entries.map((e) => [byNote[e.noteId], concepts.proximityOf(e, scope)]).sort(), [["O1", "other"], ["P2", "other"]], "de otro curso: solo la IA puede decir que es la misma idea");
			assert.equal(entries.find((e) => byNote[e.noteId] === "O1").course, "Intro to SQL", "con su curso visible");
			assert(log.every((l) => l.action === "findNotes" || l.action === "notesInfo"), "solo lectura");
		});
		await test(`${mode} · qué se puede adelantar: solo en repaso y activas (nuevas, aprendiendo, reaprendiendo, suspendidas, enterradas y las de hoy, no)`, async () => {
			log.length = 0;
			const states = await ops.noteReviewStates(invoke, Object.keys(setup.ids).map(nid));
			assert.deepEqual(Object.fromEntries(states.map((s) => [byNote[s.noteId], s.state])), {
				R1: "review", N1: "new", L1: "learning", RL: "learning", S1: "inactive", B1: "inactive", D1: "due", X1: "foreign", V1: "foreign",
				O1: "new", P2: "new",
			});
			assert(log.every((l) => l.action === "findCards"), "solo lectura");
		});
		await test(`${mode} · «Repasar hoy en Anki»: setDueDate "0" solo a R1; las demás, intactas`, async () => {
			const before = (await invoke("__state")).state;
			log.length = 0;
			const result = await ops.rescheduleToday(invoke, Object.keys(setup.ids).map(nid));
			assert.deepEqual(result.changed.map((id) => byNote[id]), ["R1"]);
			const writes = log.filter((l) => l.action !== "findCards");
			assert.deepEqual(writes, [{ action: "setDueDate", params: { cards: [setup.ids.R1.card], days: "0" } }], "un solo cambio, con \"0\" (sin «!»)");
			const { state: after, today } = await invoke("__state");
			for (const k of Object.keys(before)) if (k !== "R1") assert.deepEqual(after[k], before[k], `${k} no cambia`);
			assert.equal(after.R1.due, today, "R1 toca hoy");
			assert.deepEqual([after.R1.type, after.R1.queue], [2, 2], "sigue en repaso (no vuelve a aprendizaje)");
			if (fsrs) {
				assert.equal(after.R1.s, before.R1.s, "FSRS: la memoria de la tarjeta (estabilidad) se conserva");
				assert.equal(after.R1.ivl, 1, "FSRS: el intervalo pasa a los días reales desde el último repaso (1), no a 0");
			} else {
				assert.equal(after.R1.ivl, before.R1.ivl, "SM-2: el intervalo se conserva tal cual");
			}
			// Ya toca hoy: pulsar otra vez no cambia nada.
			log.length = 0;
			const again = await ops.rescheduleToday(invoke, [nid("R1")]);
			assert.deepEqual([again.changed, log.some((l) => l.action === "setDueDate")], [[], false]);
		});
	});
}

console.log(`QA «Repasar hoy en Anki» con Anki real (anki ${ankiVersion}): ${passed}/${passed} OK`);
