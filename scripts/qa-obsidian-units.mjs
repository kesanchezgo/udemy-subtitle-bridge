// Tests puros de la fase 3 (Obsidian conectado): plugin Local REST API con un
// vault falso, destino por curso/programa, sistema de escritura (las dos rutas),
// MOC con bloque gestionado, nota rehecha desde el historial y la Biblioteca.
// node scripts/qa-obsidian-units.mjs
import assert from "node:assert/strict";

const root = new URL("../src/", import.meta.url);
const rest = await import(new URL("app/services/obsidianRestOps.ts", root).href);
const dest = await import(new URL("app/services/obsidianDestination.ts", root).href);
const writer = await import(new URL("app/services/obsidianWriter.ts", root).href);
const ox = await import(new URL("app/services/obsidianExport.ts", root).href);
const session = await import(new URL("app/services/obsidianSession.ts", root).href);
const lib = await import(new URL("app/services/library.ts", root).href);

let passed = 0;
const test = async (name, fn) => {
	try { await fn(); passed += 1; console.log(`PASS ${name}`); }
	catch (error) { console.error(`FAIL ${name}`); throw error; }
};

/** Un vault en memoria que responde como el plugin (v5.5.2): mismas rutas, códigos y formatos. */
function fakeVault(initial = {}, { authenticated = true, move = true, down = false } = {}) {
	const files = new Map(Object.entries(initial).map(([p, content]) => [p, { content, mtime: 1000 }]));
	const calls = [];
	const request = async (method, path, opts = {}) => {
		if (down) throw new TypeError("Failed to fetch");
		calls.push(`${method} ${decodeURIComponent(path)}`);
		if (path === "/") return { status: 200, body: JSON.stringify({ status: "OK", authenticated, versions: { self: "5.5.2", obsidian: "1.9.10" } }) };
		if (!authenticated) return { status: 401, body: JSON.stringify({ errorCode: 40101, message: "Authorization required." }) };
		if (path.startsWith("/open/")) return { status: 200, body: "" };
		const raw = path.replace(/^\/vault\//, "");
		const isDir = raw === "" || raw.endsWith("/");
		const p = raw.split("/").filter(Boolean).map(decodeURIComponent).join("/");
		if (method === "GET" && isDir) {
			const prefix = p ? `${p}/` : "";
			const names = [...new Set([...files.keys()].filter((f) => f.startsWith(prefix)).map((f) => { const sub = f.slice(prefix.length); return sub.includes("/") ? sub.slice(0, sub.indexOf("/") + 1) : sub; }))].sort();
			return names.length || !p ? { status: 200, body: JSON.stringify({ files: names }) } : { status: 404, body: "{}" };
		}
		if (method === "GET") {
			const f = files.get(p);
			if (!f) return { status: 404, body: JSON.stringify({ errorCode: 40400, message: "Not Found" }) };
			return { status: 200, body: opts.accept === rest.NOTE_JSON ? JSON.stringify({ content: f.content, path: p, stat: { mtime: f.mtime, ctime: 1, size: f.content.length }, frontmatter: {} }) : f.content };
		}
		if (method === "PUT") { files.set(p, { content: opts.body, mtime: Date.now() }); return { status: 204, body: "" }; }
		if (method === "POST") {
			const prev = files.get(p)?.content ?? "";
			files.set(p, { content: (prev && !prev.endsWith("\n") ? `${prev}\n` : prev) + opts.body, mtime: Date.now() });
			return { status: 204, body: "" };
		}
		if (method === "MOVE") {
			if (!move) return { status: 404, body: "{}" };
			const to = decodeURIComponent(opts.headers.Destination);
			files.set(to, files.get(p)); files.delete(p);
			return { status: 204, body: "" };
		}
		return { status: 405, body: "{}" };
	};
	return { files, calls, request };
}

const config = { ...ox.DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: "Mi Vault" };
const data = {
	courseName: "Java In-Depth", lessonName: "What is Java & JVM?", platform: "datacamp", objective: "Entender la JVM",
	sourceUrl: "https://app.datacamp.com/learn/x",
	result: { title: "Lección completada", remembered: { count: 1, total: 2 }, check: { firstTry: 1, improved: 0, skipped: false }, practice: "done", cards: { total: 2, reinforce: 1, destination: "anki" } },
	content: {
		relevance: { score: 80, reason: "Base de todo lo demás" }, keyConcepts: ["JVM — ejecuta bytecode", "JIT — compila lo caliente"],
		questions: [{ q: "¿Qué hace la JVM?", bloom: "comprender", hint: "bytecode", answer: "Ejecuta bytecode" }],
		application: { isCode: false, setup: "Un servidor", challenge: "Explica el arranque", solution: "Carga clases" },
		interviewQ: null, nextAction: "Probar javap", ankiCards: [{ front: "¿JVM?", back: "Máquina virtual" }],
	},
};
const program = { title: "Java Engineer", slug: "java-engineer", courses: [{ title: "Java In-Depth", slug: "java-in-depth", position: 1, done: false }, { title: "Spring", slug: "spring", position: 2, done: null }], platform: "datacamp" };

await test("Conexión: solo URLs de este ordenador; la de por defecto es el servidor HTTP del plugin", () => {
	assert.equal(rest.normalizeRestUrl(""), "http://127.0.0.1:27123");
	assert.equal(rest.normalizeRestUrl("127.0.0.1:27123"), "http://127.0.0.1:27123", "sin esquema, http");
	assert.equal(rest.normalizeRestUrl("https://localhost:27124/"), "https://localhost:27124", "https local, sin barra final");
	assert.equal(rest.normalizeRestUrl("http://[::1]:27123/vault"), "http://[::1]:27123", "IPv6 local, sin ruta");
	for (const bad of ["http://example.com:27123", "http://192.168.1.20:27123", "file:///etc", "ftp://127.0.0.1"]) assert.equal(rest.normalizeRestUrl(bad), null, bad);
	assert.equal(rest.normalizeConnection({ url: "", apiKey: "  " }), null, "sin clave no hay conexión");
	assert.deepEqual(rest.normalizeConnection({ url: "", apiKey: " abc " }), { url: "http://127.0.0.1:27123", apiKey: "abc" });
	assert.equal(rest.vaultApiPath("wiki/fuentes/java---qué es.md"), "/vault/wiki/fuentes/java---qu%C3%A9%20es.md", "cada segmento codificado");
	assert.equal(rest.vaultApiPath("cursos", true), "/vault/cursos/");
});

await test("Conexión: la petición lleva la clave, el tipo del cuerpo y un tope de tiempo", async () => {
	const seen = [];
	const fetchImpl = async (url, init) => { seen.push({ url, init }); return { status: 204, text: async () => "" }; };
	const req = rest.fetchRequest({ url: "http://127.0.0.1:27123", apiKey: "k1" }, fetchImpl, 5000);
	await req("PUT", "/vault/a.md", { body: "# A" });
	assert.equal(seen[0].url, "http://127.0.0.1:27123/vault/a.md");
	assert.equal(seen[0].init.headers.Authorization, "Bearer k1");
	assert.match(seen[0].init.headers["Content-Type"], /^text\/markdown/);
	assert(seen[0].init.signal, "con AbortSignal (Obsidian colgado no bloquea el guardado)");
});

await test("Estado: conectado, clave incorrecta, Obsidian cerrado y otro servicio en el puerto", async () => {
	assert.deepEqual(await rest.restStatus(fakeVault().request), { available: true, authenticated: true, version: "5.5.2", obsidian: "1.9.10" });
	assert.equal((await rest.restStatus(fakeVault({}, { authenticated: false }).request)).authenticated, false, "responde, pero la clave no vale");
	const closed = await rest.restStatus(fakeVault({}, { down: true }).request);
	assert.equal(closed.available, false);
	assert.match(closed.error, /Failed to fetch/);
	assert.equal((await rest.restStatus(async () => ({ status: 200, body: "<html>" }))).available, false, "otra cosa en el puerto no cuenta como Obsidian");
	assert.match(rest.describeRestFailure({ status: 401, body: "" }), /rechazó la clave/);
});

await test("Vault: leer, listar, escribir, añadir y mover (sin pisar; versiones sin MOVE)", async () => {
	const v = fakeVault({ "wiki/fuentes/a---b.md": "# Nota", "wiki/fuentes/java/x.md": "x" });
	assert.deepEqual(await rest.readNote(v.request, "nada.md"), { exists: false });
	const note = await rest.readNote(v.request, "wiki/fuentes/a---b.md");
	assert.equal(note.exists, true); assert.equal(note.content, "# Nota"); assert.equal(note.mtime, 1000);
	assert.deepEqual(await rest.listFolder(v.request, "wiki/fuentes"), ["a---b.md", "java/"], "un nivel; subcarpetas con «/»");
	assert.deepEqual(await rest.listFolder(v.request, "no-existe"), [], "carpeta vacía o inexistente: lista vacía");
	await rest.appendNote(v.request, "wiki/fuentes/a---b.md", "\n## Repaso\n");
	assert.equal(v.files.get("wiki/fuentes/a---b.md").content, "# Nota\n\n## Repaso\n");
	assert.equal(await rest.moveNote(v.request, "wiki/fuentes/a---b.md", "wiki/fuentes/java/x.md"), "exists", "nunca pisa el destino");
	assert.equal(await rest.moveNote(v.request, "wiki/fuentes/a---b.md", "wiki/fuentes/java/a---b.md"), "moved");
	assert(v.files.has("wiki/fuentes/java/a---b.md") && !v.files.has("wiki/fuentes/a---b.md"));
	assert.equal(await rest.moveNote(v.request, "nada.md", "otra.md"), "missing");
	const old = fakeVault({ "a.md": "a" }, { move: false });
	assert.equal(await rest.moveNote(old.request, "a.md", "b/a.md"), "unsupported", "plugin antiguo: la nota se queda donde estaba");
	assert(old.files.has("a.md"));
	await assert.rejects(() => rest.writeNote(fakeVault({}, { authenticated: false }).request, "a.md", "x"), /rechazó la clave/);
});

await test("Destino (fase 5): siempre una carpeta por curso (el programa no la cambia), registro y C++ ≠ C#", () => {
	const base = { sourcesFolder: "wiki/fuentes", mocsFolder: "cursos" };
	assert.equal(dest.defaultCourseFolder(base, "Java In-Depth", "java-engineer"), "wiki/fuentes/java-in-depth", "una carpeta por curso, también con programa");
	assert.equal(dest.defaultCourseFolder({ ...base, noteLayout: "flat" }, "Java In-Depth"), "wiki/fuentes/java-in-depth", "la estructura de antes ya no cambia la carpeta de los cursos nuevos");
	assert.equal(dest.defaultCourseFolder({ ...base, noteLayout: "program" }, "Java In-Depth", "java-engineer"), "wiki/fuentes/java-in-depth");
	assert.notEqual(dest.defaultCourseFolder(base, "C++"), dest.defaultCourseFolder(base, "C#"));
	const registry = { [dest.courseFolderKey("Java In-Depth")]: { folder: "Cursos/Java", at: 1 } };
	assert.deepEqual(dest.courseNoteFolder(base, registry, "Java In-Depth", "otro"), { folder: "Cursos/Java", assigned: true, defaultFolder: "wiki/fuentes/java-in-depth" }, "la fijada manda aunque cambie el programa o Ajustes");
	assert.equal(dest.sessionNotePathIn("Cursos/Java", "Java In-Depth", "What is Java & JVM?"), "Cursos/Java/java-in-depth---what-is-java-jvm.md", "el nombre de la nota no cambia con la carpeta");
	assert.equal(dest.cleanVaultFolder("/../wiki//fuentes/./x/"), "wiki/fuentes/x", "sin «..», «.» ni barras sobrantes");
	assert.equal(dest.cleanVaultFolder("Notas: cursos"), "Notas: cursos", "una carpeta que ya usabas da la misma ruta");
	assert.equal(dest.layoutPreview({ ...base, noteLayout: "program" }), "wiki/fuentes/‹curso›/‹curso›---‹lección›.md");
	// Las estructuras de antes solo sirven para fijar a los cursos que ya tenían notas.
	assert.equal(dest.legacyCourseFolder({ ...base, noteLayout: "flat" }, "Java In-Depth"), "wiki/fuentes");
	assert.equal(dest.legacyCourseFolder({ ...base, noteLayout: "program" }, "Java In-Depth", "java-engineer"), "wiki/fuentes/java-engineer/java-in-depth");
	assert.equal(dest.hasLegacyLayout({ ...base, noteLayout: "flat" }), true);
	assert.equal(dest.hasLegacyLayout({ ...base, noteLayout: "course" }), false);
	assert.equal(dest.hasLegacyLayout(base), false, "sin estructura guardada (instalación nueva): nada que fijar");
});

await test("Destino: al pasar a la estructura de ahora, los cursos con notas se quedan (en su carpeta real); mover solo lo que está en otra", () => {
	const before = { sourcesFolder: "wiki/fuentes", mocsFolder: "cursos", noteLayout: "flat" };
	const reg = dest.freezeCourseFolders({ [dest.courseFolderKey("Spring")]: { folder: "Mis/Spring", at: 1 } }, before, [{ course: "Java In-Depth" }, { course: "Spring" }, { course: "SQL", programSlug: "da", notePath: "Mis notas/SQL/sql---joins.md" }], 5);
	assert.deepEqual(reg[dest.courseFolderKey("Java In-Depth")], { folder: "wiki/fuentes", at: 5 }, "Java se queda donde estaban sus notas");
	assert.equal(reg[dest.courseFolderKey("Spring")].folder, "Mis/Spring", "lo ya fijado no se toca");
	assert.deepEqual(reg[dest.courseFolderKey("SQL")], { folder: "Mis notas/SQL", program: "da", at: 5 }, "si se sabe dónde está su última nota, esa carpeta");
	assert.deepEqual(dest.folderMovePlan([{ lessonId: "a", path: "wiki/fuentes/j---a.md" }, { lessonId: "b", path: "Cursos/Java/j---b.md" }], "Cursos/Java"), [{ lessonId: "a", from: "wiki/fuentes/j---a.md", to: "Cursos/Java/j---a.md" }]);
});

await test("Escritura: plan de una lección (nota, índice, MOC del programa, transcripción en raw/<su plataforma>)", () => {
	const writes = writer.planLessonWrites({ data, config, folder: "wiki/fuentes/java-in-depth", intent: "create", program, srt: "1\n00:00:01,000 --> 00:00:02,000\nHello" });
	assert.deepEqual(writes.map((w) => [w.kind, w.mode]), [["session", "create"], ["courseMoc", "createIfMissing"], ["programMoc", "managed"], ["raw", "createIfMissing"]]);
	assert.equal(writes[0].note.path, "wiki/fuentes/java-in-depth/java-in-depth---what-is-java-jvm.md");
	assert.equal(writes[1].note.path, "cursos/java-in-depth.md");
	assert.equal(writes[2].note.path, "cursos/moc-java-engineer.md");
	assert.equal(writes[3].note.path, "raw/datacamp/java-in-depth/java-in-depth---what-is-java-jvm.md", "la transcripción de DataCamp va a raw/datacamp, no a raw/udemy");
	const append = writer.planLessonWrites({ data, config, folder: "wiki/fuentes", intent: "append" });
	assert.deepEqual(append.map((w) => [w.kind, w.mode]), [["review", "append"], ["courseMoc", "createIfMissing"]]);
	assert(append[0].note.markdown.startsWith("## Repaso · ") && !append[0].note.markdown.includes("type: sesion"), "el repaso no lleva frontmatter");
	assert.deepEqual(writer.uriOptionsFor(append[0]), { append: true });
	assert.deepEqual(writer.uriOptionsFor(writes[0]), {}, "sin conexión, la nota nueva no pisa nada");
	assert.deepEqual(writer.uriOptionsFor(writes[2]), { overwrite: true }, "«Actualizar MOC del programa» lo rehace, como antes");
});

await test("Escritura con el plugin: todo de una vez la primera vez; después, nada se pisa", async () => {
	const v = fakeVault();
	const plan = writer.planLessonWrites({ data, config, folder: "wiki/fuentes", intent: "create", program, srt: "1\nhola" });
	const first = await writer.runVaultWrites(v.request, plan);
	assert.deepEqual(first.map((o) => o.result), ["created", "created", "created", "created"]);
	const summary = writer.summarizeWrites(first);
	assert.equal(summary.title, "Nota guardada en Obsidian");
	assert.equal(summary.description, "En wiki/fuentes/ · índice del curso creado · MOC del programa creado · transcripción guardada");
	// La misma lección otra vez con «create»: la nota existe → no se escribe nada más.
	const again = await writer.runVaultWrites(v.request, plan);
	assert.deepEqual(again.map((o) => o.result), ["exists"], "si la nota ya existe, no se pisa ni se sigue");
	// Añadir el repaso: la nota crece; índice y transcripción se quedan como estaban.
	v.files.set("cursos/java-in-depth.md", { content: "# Índice editado a mano", mtime: 1 });
	const review = await writer.runVaultWrites(v.request, writer.planLessonWrites({ data, config, folder: "wiki/fuentes", intent: "append", srt: "1\nhola" }));
	assert.deepEqual(review.map((o) => o.result), ["appended", "kept", "kept"]);
	assert.equal(v.files.get("cursos/java-in-depth.md").content, "# Índice editado a mano", "el índice que editaste no se toca");
	assert(v.files.get("wiki/fuentes/java-in-depth---what-is-java-jvm.md").content.includes("\n## Repaso · "), "el repaso queda al final");
	assert.equal(writer.summarizeWrites(review).title, "Repaso añadido a la nota");
});

await test("MOC del programa: solo se reescribe su bloque entre marcas; uno antiguo sin marcas no se toca", async () => {
	const fresh = ox.buildProgramMocMarkdown({ ...program, courses: program.courses.map((c) => ({ ...c, done: true })) }, { sourcesFolder: "wiki/fuentes", mocsFolder: "cursos" });
	const mine = `${ox.buildProgramMocMarkdown(program, { sourcesFolder: "wiki/fuentes", mocsFolder: "cursos" })}\n## Mis notas\nEsto es mío.\n`;
	const merged = ox.replaceManagedBlock(mine, fresh);
	assert(merged.includes("Esto es mío.") && merged.includes("✅ completado") && !merged.includes("⬜ pendiente"), "progreso nuevo, notas propias intactas");
	assert.equal(ox.replaceManagedBlock("# MOC antiguo sin marcas", fresh), null);
	const v = fakeVault({ "cursos/moc-java-engineer.md": "# MOC antiguo sin marcas" });
	const out = await writer.runVaultWrite(v.request, { kind: "programMoc", mode: "managed", note: { path: "cursos/moc-java-engineer.md", markdown: fresh } });
	assert.equal(out.result, "kept");
	assert.equal(v.files.get("cursos/moc-java-engineer.md").content, "# MOC antiguo sin marcas");
	v.files.set("cursos/moc-java-engineer.md", { content: mine, mtime: 1 });
	assert.equal((await writer.runVaultWrite(v.request, { kind: "programMoc", mode: "managed", note: { path: "cursos/moc-java-engineer.md", markdown: fresh } })).result, "updated");
});

await test("Índices: encuentran las sesiones en cualquier carpeta (carpeta de lecciones O etiqueta)", () => {
	const moc = ox.buildCourseMocMarkdown("Java In-Depth", { sourcesFolder: "wiki/fuentes" });
	assert(moc.includes('FROM "wiki/fuentes" OR #kinema/sesion'), "por la carpeta (con subcarpetas) o por la etiqueta");
	assert(moc.includes('FROM "wiki/fuentes"'), "compatible con el test de la nota del repositorio");
	const pMoc = ox.buildProgramMocMarkdown(program, { sourcesFolder: "wiki/fuentes", mocsFolder: "cursos" });
	assert(pMoc.includes('FROM "wiki/fuentes" OR #kinema/sesion') && pMoc.includes('WHERE contains(programas, "java-engineer") OR programa_slug = "java-engineer"'));
	assert(pMoc.includes(ox.KINEMA_AUTO_START) && pMoc.includes(ox.KINEMA_AUTO_END));
	assert.equal(ox.buildSessionNotePath(config, "Java In-Depth", "L1"), "wiki/fuentes/java-in-depth---l1.md", "sin carpeta, la de siempre");
	assert.equal(ox.buildSessionNotePath(config, "Java In-Depth", "L1", "Cursos/Java"), "Cursos/Java/java-in-depth---l1.md");
	const keys = [ox.sessionExportKey(config, "Java In-Depth", "L1", "Cursos/Java")];
	assert.equal(ox.isSessionExported(keys, config, "Java In-Depth", "L1", "Cursos/Java"), true);
	assert.equal(ox.isSessionExported(keys, config, "Java In-Depth", "L1"), false, "otra carpeta = otra nota");
});

const record = {
	courseId: "javaindepth", courseName: "Java In-Depth", lectureId: "jvm", lectureName: "What is Java & JVM?", status: "completed", finishedAt: 10,
	objective: "Entender la JVM", platform: "udemy", lessonUrl: "https://www.udemy.com/course/java/learn/lecture/1",
	recallMarks: ["knew", "unsure"], spotCheck: "ok", recallNotes: "La JVM ejecuta bytecode",
	questionsDone: true, practiceStatus: "correct",
	questions: [{ prompt: "¿Qué hace la JVM?", answer: "x", rating: "wrong" }, { prompt: "¿Y el JIT?", answer: "y", rating: "correct", firstTryCorrect: true }],
	exportedAt: 11, ankiDeck: "Kinema::Courses::Java In-Depth",
	ankiCards: [{ front: "¿JVM?", back: "Máquina virtual", type: "concepto", reinforce: true }, { front: "¿Quitada?", back: "no", excluded: true }, { front: "¿Duda?", back: "sí", doubt: true }],
	doubts: [{ id: "t", kind: "idea", anchor: "JIT", updatedAt: 1, turns: [{ q: "¿Cuándo compila?", answer: "Cuando el código está caliente", quotes: ["hot code"], outside: false, card: null, source: "ai", at: 1 }] }],
	studyContent: { ...data.content, questions: [{ q: "¿Qué hace la JVM?", bloom: "comprender", difficulty: "clear", hint: "", answer: "Ejecuta bytecode" }, { q: "¿Y el JIT?", bloom: "aplicar", difficulty: "clear", hint: "", answer: "Compila" }] },
	version: 3, startedAt: 1, updatedAt: 12, ankiCardsCount: 2,
};

await test("Nota desde el historial: mismas secciones con lo que el historial guarda (sin inventar)", () => {
	const d = session.sessionDataFromRecord(record, { includeCards: true });
	assert.deepEqual(d.result.remembered, { count: 1, total: 2 });
	assert.deepEqual(d.result.check, { firstTry: 1, improved: 0, skipped: false });
	assert.equal(d.result.title, "Lección completada", "una fallada: no es «dominada»");
	assert.deepEqual(d.result.cards, { total: 2, reinforce: 1, destination: "anki", doubt: 1 }, "lo quitado no cuenta; la duda aparte");
	assert.deepEqual(d.weakPoints, [{ q: "¿Qué hace la JVM?", answer: "Ejecuta bytecode" }], "lo fallado, con su respuesta correcta");
	assert.deepEqual(d.unrecalledIdeas, ["JIT — compila lo caliente"], "lo que no sabías en Recordar");
	assert.equal(d.calibration, undefined);
	const md = ox.buildSessionNoteMarkdown(d, config);
	for (const part of ["## Resultado de la sesión", "## Lo que recordé sin mirar", "## Puntos a reforzar", "## Dudas resueltas", "lesson_url: \"https://www.udemy.com/course/java/learn/lecture/1\"", "platform: udemy", "anki_deck:"]) assert(md.includes(part), part);
	assert(!md.includes("Calibración"), "la calibración es de la sesión: no se inventa");
	assert.equal(session.sessionDataFromRecord({ ...record, studyContent: undefined }), null, "sin contenido no hay nota");
	const dc = session.sessionDataFromRecord({ ...record, platform: undefined, dcTrackSlug: "java-engineer" }, { programTitles: { "java-engineer": "Java Engineer" } });
	assert.deepEqual([dc.platform, dc.program, dc.programs], ["datacamp", { slug: "java-engineer", title: "Java Engineer" }, ["java-engineer"]]);
});

await test("Biblioteca: carpeta del curso (la de Fijar), ruta de cada nota y lo que hay de verdad en el vault", () => {
	const recs = [
		{ ...record, lectureId: "a", lectureName: "A", obsidianExportedAt: 5 },
		{ ...record, lectureId: "b", lectureName: "B", obsidianExportedAt: 6, obsidianNotePath: "Cursos/Java/java-in-depth---b.md" },
		{ ...record, lectureId: "c", lectureName: "C" },
		{ ...record, lectureId: "d", lectureName: "D", status: "in_progress", finishedAt: undefined },
	];
	const registry = { [dest.courseFolderKey("Java In-Depth")]: { folder: "Cursos/Java", at: 1 } };
	const course = lib.buildLibrary(recs, { config: { rootDeck: "Kinema" }, registry: {}, obsidian: { config: { sourcesFolder: "wiki/fuentes", mocsFolder: "cursos" }, registry } })[0].courses[0];
	assert.deepEqual(course.obsidian, { folder: "Cursos/Java", assigned: true, defaultFolder: "wiki/fuentes/java-in-depth", mocPath: "cursos/java-in-depth.md", savable: 1 });
	assert.deepEqual(course.lessons.map((l) => l.notePath), [
		"wiki/fuentes/java-in-depth---a.md", // exportada antes de guardar la ruta: donde iban todas
		"Cursos/Java/java-in-depth---b.md", // la ruta guardada
		"Cursos/Java/java-in-depth---c.md", // sin nota: donde iría
		"Cursos/Java/java-in-depth---d.md",
	]);
	assert.deepEqual(course.lessons.map((l) => l.obsidianSavable), [false, false, true, false], "solo terminada, con contenido y sin nota");
	assert.deepEqual(lib.obsidianFoldersToCheck(course).sort(), ["Cursos/Java", "cursos", "wiki/fuentes"], "una petición por carpeta, no por nota");
	const state = lib.courseVaultState(course, { "wiki/fuentes": ["java-in-depth---a.md"], "Cursos/Java": [], cursos: ["java-in-depth.md"] });
	assert.deepEqual(state, { notes: { a: "present", b: "missing", c: "missing" }, mocExists: true, missing: 1 }, "B se exportó pero ya no está en el vault");
	const none = lib.buildLibrary(recs, { config: { rootDeck: "Kinema" }, registry: {} })[0].courses[0];
	assert.equal(none.obsidian, null, "sin Obsidian configurado, nada de carpetas");
	assert(none.lessons.every((l) => l.notePath === null && !l.obsidianSavable));
});

await test("Etiquetas (fase 5): todo bajo kinema/ — sesión, índices y transcripción; las relaciones, en propiedades", () => {
	const md = ox.buildSessionNoteMarkdown({ ...data, platform: "datacamp", program: { title: "Java Engineer", slug: "java-engineer" }, programs: ["java-engineer", "backend-dev"] }, config);
	const tags = md.match(/^tags: \[(.*)\]$/m)?.[1].split(", ");
	assert.deepEqual(tags, ["kinema/sesion", "kinema/curso/java-in-depth", "kinema/plataforma/datacamp"], "la plataforma ya no va suelta en la raíz de tus etiquetas");
	assert.match(md, /^programas: \[java-engineer, backend-dev\]$/m, "un curso en varios programas: propiedad (la lee el MOC de cada uno)");
	assert.match(md, /^programa_slug: java-engineer$/m);
	const courseMoc = ox.buildCourseMocMarkdown("Java In-Depth", { platform: "udemy", sourcesFolder: "wiki/fuentes" });
	assert.match(courseMoc, /^tags: \[kinema\/moc\/curso, kinema\/plataforma\/udemy\]$/m, "el índice del curso: sin etiquetas sueltas (antes: curso, udemy, java-in-depth)");
	assert.match(ox.buildProgramMocMarkdown(program, { sourcesFolder: "wiki/fuentes", mocsFolder: "cursos" }), /^tags: \[kinema\/moc\/programa, kinema\/plataforma\/datacamp\]$/m);
	assert.match(ox.buildRawSrtNoteMarkdown("Java In-Depth", "JVM", "1\n00:00:01,000 --> 00:00:02,000\nHi", { platform: "udemy" }), /^tags: \[kinema\/raw, kinema\/curso\/java-in-depth, kinema\/plataforma\/udemy\]$/m);
	assert.equal(ox.DEFAULT_OBSIDIAN_EXPORT_CONFIG.noteLayout, "course", "instalación nueva: una carpeta por curso");
});

console.log(`QA unidades de Obsidian: ${passed}/${passed} OK`);
