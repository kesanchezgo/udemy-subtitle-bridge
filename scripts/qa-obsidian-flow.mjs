// QA de la fase 3 (Obsidian conectado) en el prototipo, con un vault simulado:
// el plugin Local REST API falso responde con las MISMAS operaciones que usa el
// service worker (obsidianRestOps + runVaultWrites), así que lo que se prueba es
// la cadena real salvo el fetch. Fijar (guardar todo de una vez, añadir repaso,
// cambiar de carpeta moviendo la nota), Ajustes (conexión, estructura), el
// respaldo con obsidian:// si Obsidian está cerrado, y la Biblioteca (vault real,
// guardar las que faltan, nota que ya no está).
// node scripts/qa-obsidian-flow.mjs   ·   QA_DEBUG=1 para ver cada etapa.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const port = 4193;
const url = `http://127.0.0.1:${port}`;
const debug = (...args) => { if (process.env.QA_DEBUG) console.log("·", ...args); };
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "pipe" });
let browser;
let page;
const pageErrors = [];

async function stage(name, fn) {
  debug(name);
  try {
    return await fn();
  } catch (error) {
    const shot = `/tmp/qa-obsidian-fail-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    await page?.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const text = await page?.evaluate(() => document.body.innerText.slice(0, 2500)).catch(() => "");
    console.error(`FAIL ${name} — captura: ${shot}\n--- texto visible ---\n${text}\n---`);
    if (pageErrors.length) console.error("--- errores de página ---\n" + pageErrors.slice(-3).join("\n"));
    throw error;
  }
}

// El vault simulado vive en la página: obsidianBridge le habla por setObsidianTransport,
// y cada operación pasa por las funciones reales del service worker.
const installFakeVault = () => page.evaluate(async () => {
  const rest = await import("/src/app/services/obsidianRestOps.ts");
  const writer = await import("/src/app/services/obsidianWriter.ts");
  const bridge = await import("/src/app/services/obsidianBridge.ts");
  const fake = { files: {}, calls: [], opened: [], down: false, keys: [] };
  window.__vault = fake;
  const request = async (method, path, opts = {}) => {
    if (path === "/") return { status: 200, body: JSON.stringify({ status: "OK", authenticated: true, versions: { self: "5.5.2", obsidian: "1.9.10" } }) };
    const raw = path.replace(/^\/vault\//, "");
    const isDir = raw === "" || raw.endsWith("/");
    const p = raw.split("/").filter(Boolean).map(decodeURIComponent).join("/");
    if (method === "GET" && isDir) {
      const prefix = p ? `${p}/` : "";
      const names = [...new Set(Object.keys(fake.files).filter((f) => f.startsWith(prefix)).map((f) => { const sub = f.slice(prefix.length); return sub.includes("/") ? sub.slice(0, sub.indexOf("/") + 1) : sub; }))].sort();
      return names.length || !p ? { status: 200, body: JSON.stringify({ files: names }) } : { status: 404, body: "{}" };
    }
    if (method === "GET") {
      const f = fake.files[p];
      return f === undefined ? { status: 404, body: "{}" } : { status: 200, body: JSON.stringify({ content: f, path: p, stat: { mtime: Date.now(), ctime: 1, size: f.length }, frontmatter: {} }) };
    }
    if (method === "PUT") { fake.files[p] = opts.body; return { status: 204, body: "" }; }
    if (method === "POST") { const prev = fake.files[p] ?? ""; fake.files[p] = (prev && !prev.endsWith("\n") ? `${prev}\n` : prev) + opts.body; return { status: 204, body: "" }; }
    if (method === "MOVE") { const to = decodeURIComponent(opts.headers.Destination); fake.files[to] = fake.files[p]; delete fake.files[p]; return { status: 204, body: "" }; }
    return { status: 405, body: "{}" };
  };
  bridge.setObsidianTransport(async (msg) => {
    fake.calls.push(msg.op);
    fake.keys.push(msg.connection?.apiKey);
    if (msg.op === "status") return { ok: true, status: fake.down ? { available: false, error: "Failed to fetch" } : await rest.restStatus(request) };
    if (fake.down) return { ok: false, error: "Obsidian no responde.", unreachable: true };
    try {
      if (msg.op === "read") return { ok: true, note: await rest.readNote(request, msg.path) };
      if (msg.op === "list") return { ok: true, files: await rest.listFolder(request, msg.folder) };
      if (msg.op === "writes") return { ok: true, outcomes: await writer.runVaultWrites(request, msg.writes) };
      if (msg.op === "open") { fake.opened.push(msg.path); return { ok: true }; }
      if (msg.op === "move") { const results = []; for (const m of msg.moves) results.push(await rest.moveNote(request, m.from, m.to)); return { ok: true, results }; }
    } catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
    return { ok: false, error: `op ${msg.op}` };
  });
  // Las URIs obsidian:// se recogen en vez de lanzar la app.
  window.__obsidian = [];
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("a") : null;
    if (a && a.href.startsWith("obsidian:")) { window.__obsidian.push(decodeURIComponent(a.href)); e.preventDefault(); }
  }, true);
});
const vault = () => page.evaluate(() => window.__vault);
const uris = () => page.evaluate(() => window.__obsidian);
const record = (re = /whatisjava/) => page.evaluate((src) => {
  const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && new RegExp(src).test(k));
  return key ? JSON.parse(localStorage.getItem(key)) : null;
}, re.source);
const shotPath = (name) => `/tmp/kinema-obsidian-${name}${process.env.QA_THEME ? `-${process.env.QA_THEME}` : ""}.png`;
const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).last();

const java = "Java In-Depth: Become a Complete Java Engineer!";
const javaNote = "java-in-depth-become-a-complete-java-engineer---what-is-java-jvm.md";

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  await fetch(`${url}/src/main.tsx`).catch(() => {});
  for (let i = 0; i < 600; i++) {
    const ok = await Promise.all(["react.js", "react-dom_client.js"].map((f) => fetch(`${url}/node_modules/.vite/deps/${f}`).then((r) => r.ok, () => false)));
    if (ok.every(Boolean)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.route("**/src/main.tsx", (route) => route.fulfill({ contentType: "application/javascript", body: 'import React from "/node_modules/.vite/deps/react.js"; import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js"; import App from "/src/app/App.tsx"; import "/src/styles/index.css"; ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));' }));
  await page.goto(url);
  // QA_THEME=dark|sepia: las mismas pantallas en el otro tema (capturas en /tmp/kinema-obsidian-*-<tema>.png).
  await page.evaluate((theme) => { localStorage.clear(); if (theme) localStorage.setItem("usb_dock_theme", theme); }, process.env.QA_THEME ?? "");
  await page.reload();

  // ── 1. Llegar a Fijar con Obsidian «conectado» ─────────────────────────
  await stage("llegar a Fijar", async () => {
    await installFakeVault();
    // Primero el transporte, luego la clave: el cambio de Ajustes dispara la comprobación.
    await page.evaluate(async () => {
      const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
      const { DEFAULT_OBSIDIAN_EXPORT_CONFIG } = await import("/src/app/services/obsidianExport.ts");
      await chromeLocalStorage.set({ obsidian_export_config: { ...DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: "Mi Vault", restApiKey: "clave-qa", includeRawSrt: false } });
    });
    await page.getByText("Continuar sin cuenta", { exact: true }).click();
    await page.getByPlaceholder("Ej: Conseguir trabajo en fintech como Java dev en 3 meses…").fill("Entender cómo la JVM ejecuta Java");
    await page.getByRole("button", { name: /Generar sesión de aprendizaje|Empezar/ }).click();
    await page.getByRole("button", { name: /^Entendido/ }).click({ timeout: 30000 });
    await page.getByRole("button", { name: /^Ponerme a prueba/ }).click();
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    await page.getByRole("button", { name: "Continuar a Aplicar" }).click();
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    await page.locator("[data-obsidian-folder]").first().waitFor();
  });
  console.log("PASS Fijar alcanzado con un vault simulado (plugin Local REST API)");

  const javaFolder = "wiki/fuentes/java-in-depth-become-a-complete-java-engineer";
  // ── 2. Terminar la lección: la nota llega sola, todo de una vez ─────────
  await stage("guardar todo de una vez", async () => {
    await page.getByText(/^Conectado · «Mi Vault»/).waitFor({ timeout: 10000 });
    // Fase 5: sin exportar — ni «Guardar», ni «Exportar», ni Copiar/.md en Fijar.
    const module = page.locator("section").filter({ has: page.locator("[data-obsidian-folder]") }).first();
    assert.equal(await module.getByRole("button", { name: /^(Guardar|Exportar|Copiar|\.md|Añadir repaso)$/ }).count(), 0, "Fijar no tiene botones de exportar a Obsidian");
    const line = module.locator("[data-sync]");
    await module.locator('[data-sync="ready"]').waitFor();
    assert.match(await line.innerText(), /Al terminar, se guardan solos la nota y el índice del curso\./, `qué va a pasar: ${await line.innerText()}`);
    assert.equal(await page.locator("[data-obsidian-folder-name]").first().innerText(), `${javaFolder}/`, "fase 5: una carpeta por curso");
    assert.match(await page.locator("[data-finish-summary]").innerText(), /la nota va a Obsidian/);
    await page.locator("[data-obsidian-folder]").first().scrollIntoViewIfNeeded();
    await page.locator(".usb-dock").screenshot({ path: shotPath("fijar") });
    assert.deepEqual(Object.keys((await vault()).files), [], "nada se escribe antes de terminar");
    // Un aviso puede tapar el botón: el clic va directo a él.
    await page.getByRole("button", { name: /Terminar lección/ }).dispatchEvent("click");
    await toast("Nota guardada en Obsidian").waitFor();
    assert.match(await toast("Nota guardada en Obsidian").innerText(), new RegExp(`En ${javaFolder}/ · índice del curso creado`));
    await module.locator('[data-sync="saved"]').waitFor();
    const v = await vault();
    assert.deepEqual(Object.keys(v.files).sort(), ["cursos/java-in-depth-become-a-complete-java-engineer.md", `${javaFolder}/${javaNote}`], "nota e índice del curso, al terminar y sin diálogos");
    const note = v.files[`${javaFolder}/${javaNote}`];
    assert(note.includes("type: sesion") && note.includes("## Resultado de la sesión"));
    assert.match(note, /^tags: \[kinema\/sesion, kinema\/curso\/java-in-depth-become-a-complete-java-engineer, kinema\/plataforma\/udemy\]$/m, "etiquetas, todas bajo kinema/");
    assert(v.keys.every((k) => k === "clave-qa"), "cada llamada lleva la clave guardada");
    assert.deepEqual(await uris(), [], "con conexión directa no se abre ningún obsidian://");
    await page.waitForTimeout(400);
    const rec = await record();
    assert.equal(rec?.obsidianNotePath, `${javaFolder}/${javaNote}`, "el historial sabe dónde quedó la nota");
    assert.equal(rec?.platform, "udemy");
    assert.equal(rec?.syncPending?.obsidian, undefined, "Obsidian: nada esperando");
    assert(rec?.syncPending?.anki, "sin Anki conectado, las tarjetas esperan a Anki (se enviarán solas)");
    const registry = await page.evaluate(async () => (await import("/src/app/services/obsidianBridge.ts")).loadCourseFolders());
    assert.equal(Object.values(registry)[0]?.folder, javaFolder, "el curso queda fijado en su carpeta");
    await page.locator("[data-obsidian-note-state=present]").waitFor();
    await page.locator(".usb-dock").screenshot({ path: shotPath("fijar-guardada") });
  });
  console.log("PASS Terminar lección: nota + índice del curso, solos y de una vez (sin botones de exportar); historial con la ruta y curso fijado en su carpeta");

  // ── 3. Abrir y «Reemplazar…»: la nota existe; el índice que editaste no se toca ──
  await stage("añadir repaso", async () => {
    await page.evaluate(() => { window.__vault.files["cursos/java-in-depth-become-a-complete-java-engineer.md"] = "# Índice editado a mano"; });
    await page.getByRole("button", { name: "Abrir en Obsidian" }).dispatchEvent("click");
    await page.waitForTimeout(200);
    assert.deepEqual((await vault()).opened, [`${javaFolder}/${javaNote}`], "Abrir: la nota de la lección, por el plugin");
    await page.getByRole("button", { name: "Reemplazar…" }).dispatchEvent("click");
    await toast("Esta lección ya tiene nota").waitFor();
    await toast("Esta lección ya tiene nota").getByRole("button", { name: "Añadir" }).click();
    await toast("Repaso añadido a la nota").waitFor();
    const v = await vault();
    assert(v.files[`${javaFolder}/${javaNote}`].includes("\n## Repaso · "), "el repaso queda al final");
    assert.equal(v.files["cursos/java-in-depth-become-a-complete-java-engineer.md"], "# Índice editado a mano", "lo que editaste en el índice no se toca");
  });
  console.log("PASS Abrir en Obsidian y «Reemplazar…» (que ofrece añadir el repaso): la nota crece y el índice que editaste no se toca");

  // ── 4. Cambiar la carpeta del curso moviendo la nota ───────────────────
  await stage("cambiar carpeta", async () => {
    const picker = page.locator("[data-obsidian-folder]").first();
    await picker.getByRole("button", { name: "Cambiar" }).click();
    await picker.getByRole("radio").nth(1).check();
    await picker.getByLabel("Ruta de la carpeta").fill("Cursos/Java");
    const move = picker.getByRole("checkbox");
    assert(await move.isChecked(), "mover la nota que ya existe viene marcado");
    assert.match(await picker.innerText(), /Mover también la nota que ya está en el vault \(Obsidian actualiza los enlaces\)/);
    await page.locator(".usb-dock").screenshot({ path: shotPath("cambiar") });
    await picker.getByRole("button", { name: "Usar esta carpeta" }).click();
    await toast("Carpeta del curso actualizada").waitFor();
    assert.match(await toast("Carpeta del curso actualizada").innerText(), /1 nota pasó a Cursos\/Java\//);
    assert.equal(await toast("Carpeta del curso actualizada").getByRole("button", { name: "Abrir" }).count(), 0, "el aviso nuevo no hereda la acción del anterior");
    const v = await vault();
    assert(v.files[`Cursos/Java/${javaNote}`] && !v.files[`${javaFolder}/${javaNote}`], "la nota se movió (con el renombrado de Obsidian)");
    await page.locator("[data-obsidian-folder-name]").filter({ hasText: "Cursos/Java/" }).first().waitFor();
    assert.equal((await record())?.obsidianNotePath, `Cursos/Java/${javaNote}`, "el historial sigue a la nota");
    await page.locator("[data-obsidian-note-state=present]").waitFor();
  });
  console.log("PASS Cambiar: la carpeta de todo el curso, moviendo la nota que ya existía; historial al día");

  // ── 5. Ajustes: conexión primero, estructura fija, sin «guardar al terminar» ──
  await stage("ajustes", async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "obsidian" } })));
    const status = page.locator("[data-obsidian-connection-status]");
    await status.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => /Conectado · Obsidian 1\.9\.10 · guardado automático/.test(document.querySelector("[data-obsidian-connection-status]")?.textContent ?? ""), null, { timeout: 10000 });
    assert.match(await page.locator("[data-obsidian-connection]").innerText(), /Local REST API · 5\.5\.2/, "el plugin y su versión, como AnkiConnect");
    const prefs = page.locator("section[aria-label='Obsidian']");
    assert.equal(await prefs.locator("[data-status-pill]").first().innerText(), "Conectado", "la misma píldora que Anki");
    const groups = await prefs.locator("h4").allInnerTexts();
    assert.deepEqual(groups.map((g) => g.toLowerCase()), ["vault y conexión", "carpetas", "nota", "opciones adicionales"], `vault y conexión arriba: ${groups}`);
    assert.equal(await prefs.locator("[data-obsidian-fallback]").getAttribute("open"), null, "el respaldo sin plugin, plegado al final");
    assert.equal(await page.getByRole("button", { name: "Organización de las notas" }).count(), 0, "sin «Organización»: una carpeta por curso");
    assert.equal(await prefs.getByText("Guardar al terminar la lección").count(), 0, "sin interruptor: conectado, se guarda siempre al terminar");
    assert.equal(await prefs.getByRole("button", { name: /Guardar preferencias|Preferencias guardadas/ }).count(), 0, "sin botón de guardar: todo se guarda solo");
    assert.equal(await page.locator("[data-obsidian-layout]").innerText(), "wiki/fuentes/‹curso›/‹curso›---‹lección›.md");
    assert.match(await page.locator("[data-obsidian-tree]").innerText(), /cursos\/moc-‹programa›\.md/);
    await page.locator("[data-obsidian-connection]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath("ajustes") });
    // El nombre del vault vive arriba del todo en «Tu vault y conexión» y se guarda solo, sin botón.
    await prefs.getByLabel("Nombre del vault").fill("Mi Vault ");
    await prefs.getByLabel("Nombre del vault").press("Tab");
    await page.waitForFunction(async () => (await import("/src/app/services/obsidianExport.ts")).loadObsidianExportConfig().then((c) => c.vaultName === "Mi Vault"), null, { timeout: 5000 });
    const registry = await page.evaluate(async () => (await import("/src/app/services/obsidianBridge.ts")).loadCourseFolders());
    assert.deepEqual(Object.values(registry).map((r) => r.folder), ["Cursos/Java"], "Java ya estaba fijado: no cambia");
    // «Plantillas y guía inicial del vault»: botón de acción puntual (sin interruptor confuso), crea una vez lo que falte sin pisar.
    await page.evaluate(() => { window.__vault.files["CLAUDE.md"] = "# Mi esquema\n"; });
    await prefs.locator("[data-obsidian-scaffold-write]").dispatchEvent("click");
    await toast("Vault preparado").waitFor();
    const v = await vault();
    assert(v.files["AGENTS.md"] && v.files["plantillas/sesion.md"] && v.files["index.md"], "la estructura se escribe en el vault");
    assert.equal(v.files["CLAUDE.md"], "# Mi esquema\n", "un CLAUDE.md tuyo no se pisa");
    assert.match(v.files["AGENTS.md"], /wiki\/fuentes\/<curso>\/` — UNA nota por sesión/, "el esquema del vault dice la estructura de ahora");
    const cfg = await page.evaluate(async () => (await import("/src/app/services/obsidianExport.ts")).loadObsidianExportConfig());
    assert(cfg.prepareVault === true && typeof cfg.vaultPreparedAt === "number", "queda hecho: no se repite solo");
    await prefs.locator("[data-obsidian-scaffold-write]").waitFor();
    assert.match(await prefs.locator("[data-obsidian-prepare]").innerText(), /Preparado el/);
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).dispatchEvent("click");
  });
  console.log("PASS Ajustes: conexión primero, estructura fija (carpeta por curso, índice y MOC por programa), sin «guardar al terminar» ni botón de guardar (todo se guarda solo); lo fijado no se mueve; «Preparar el vault» crea lo que falta una vez, sin pisar");

  // ── 6. Obsidian cerrado: lo que espera se guarda solo cuando vuelve ─────
  await stage("respaldo obsidian://", async () => {
    // Obsidian se cierra (y Kinema lo comprueba: cambiar Ajustes vuelve a mirar al momento).
    await page.evaluate(async () => {
      window.__vault.down = true;
      const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
      const cfg = (await chromeLocalStorage.get(["obsidian_export_config"])).obsidian_export_config;
      await chromeLocalStorage.set({ obsidian_export_config: { ...cfg, includeCards: true } });
    });
    await page.getByText("Obsidian no responde", { exact: true }).first().waitFor({ timeout: 10000 });
    // Otra lección terminada mientras Obsidian no respondía: espera (historial).
    await page.evaluate(() => {
      const now = Date.now();
      const content = { relevance: { score: 60, reason: "Base" }, keyConcepts: ["Heap — memoria de objetos"], questions: [{ q: "¿Qué es el heap?", answer: "Memoria de objetos" }],
        application: { isCode: false, setup: "", challenge: "", solution: "" }, interviewQ: null, nextAction: "Repasar", ankiCards: [] };
      localStorage.setItem("usb_history_lecture::javaindepthbecomeacompletejavaengineer::memoria", JSON.stringify({
        courseId: "javaindepthbecomeacompletejavaengineer", lectureId: "memoria", courseName: "Java In-Depth: Become a Complete Java Engineer!", lectureName: "Memoria",
        questions: [], status: "completed", startedAt: now - 2000, updatedAt: now - 2000, finishedAt: now - 1000, studyContent: content, ankiCardsCount: 0, platform: "udemy",
        syncPending: { obsidian: now - 1000 },
      }));
    });
    assert.deepEqual(await uris(), [], "sin obsidian://: espera");
    // Obsidian vuelve: la nota que esperaba se guarda sola, en la carpeta de su curso.
    await page.evaluate(async () => {
      window.__vault.down = false;
      const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
      const cfg = (await chromeLocalStorage.get(["obsidian_export_config"])).obsidian_export_config;
      await chromeLocalStorage.set({ obsidian_export_config: { ...cfg, includeCards: false } });
    });
    await toast("La nota que esperaba ya está en Obsidian").waitFor({ timeout: 15000 });
    const v = await vault();
    assert(v.files["Cursos/Java/java-in-depth-become-a-complete-java-engineer---memoria.md"], `en la carpeta fijada del curso: ${Object.keys(v.files).join(", ")}`);
    await page.waitForTimeout(300);
    const rec = await record(/memoria/);
    assert.equal(rec?.syncPending, undefined, "ya no espera");
    assert.equal(rec?.obsidianNotePath, "Cursos/Java/java-in-depth-become-a-complete-java-engineer---memoria.md");
    assert.deepEqual(await uris(), [], "nunca por obsidian://");
  });
  console.log("PASS Obsidian cerrado: la lección espera (sin obsidian://) y su nota se guarda sola, en la carpeta de su curso, cuando Obsidian vuelve");

  // ── 7. Biblioteca: vault real, guardar las que faltan, nota que ya no está ──
  await stage("biblioteca", async () => {
    await page.evaluate(async () => {
      const now = Date.now();
      const content = {
        relevance: { score: 70, reason: "Base" }, keyConcepts: ["Variable — nombre para un valor", "Tipo — va con el valor"],
        questions: [{ q: "¿Qué es una variable?", bloom: "recordar", difficulty: "clear", hint: "", answer: "Un nombre para un valor" }],
        application: { isCode: false, setup: "", challenge: "", solution: "" }, interviewQ: null, nextAction: "Practicar", ankiCards: [],
      };
      const base = { courseId: "intro-python", courseName: "Introduction to Python", questions: [], status: "completed", studyContent: content, ankiCardsCount: 1, ankiCards: [{ front: "¿Variable?", back: "Un nombre", type: "concepto" }], dcTrackSlug: "data-scientist-in-python", platform: "datacamp" };
      for (const [i, name] of ["Variables", "Functions"].entries()) {
        localStorage.setItem(`usb_history_lecture::intro-python::l${i}`, JSON.stringify({ ...base, lectureId: `l${i}`, lectureName: name, startedAt: now - 9000 + i, updatedAt: now - 9000 + i, finishedAt: now - 8000 + i }));
      }
    });
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    const list = page.getByRole("region", { name: "Cursos estudiados" });
    await list.waitFor();
    await list.locator("button[aria-expanded]").filter({ hasText: "Introduction to Python" }).click();
    const py = page.locator('[data-library-course="intro-python"]');
    await py.locator("[data-library-obsidian]").waitFor();
    assert.equal(await py.locator("[data-obsidian-folder-name]").innerText(), "wiki/fuentes/introduction-to-python/", "por curso (Ajustes), la misma carpeta que usaría Fijar");
    const save = py.locator("[data-library-save-notes]");
    await save.waitFor({ timeout: 10000 });
    assert.equal(await save.innerText(), "Guardar las 2 notas que faltan");
    await save.click();
    await toast("2 notas guardadas en Obsidian").waitFor();
    const v = await vault();
    const note = v.files["wiki/fuentes/introduction-to-python/introduction-to-python---variables.md"];
    assert(note && note.includes("platform: datacamp") && note.includes("programa_slug: data-scientist-in-python") && note.includes("## Resultado de la sesión"), "rehecha desde el historial, con su plataforma y programa");
    await py.locator("[data-library-vault-check]").filter({ hasText: "Comprobado en el vault." }).waitFor();
    assert.match(await py.locator("[data-library-obsidian-count]").innerText(), /2 de 2 lecciones en Obsidian/);
    await py.locator("[data-library-obsidian]").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = "hidden"; }));
    await page.locator(".usb-dock").screenshot({ path: shotPath("biblioteca") });
    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = ""; }));

    // Java: la nota se borra a mano en Obsidian → la Biblioteca lo dice y ofrece guardarla otra vez.
    await page.evaluate((path) => { delete window.__vault.files[path]; }, `Cursos/Java/${javaNote}`);
    // dispatchEvent: un aviso de logro (Sonner) puede tapar el botón; es solo un recurso del test.
    await list.locator("button[aria-expanded]").filter({ hasText: "Java In-Depth" }).dispatchEvent("click");
    const jv = page.locator("[data-library-course]").filter({ has: page.locator("[data-obsidian-folder-name]", { hasText: "Cursos/Java/" }) });
    await jv.locator("[data-library-vault-check]").filter({ hasText: "1 ya no está en el vault." }).waitFor({ timeout: 10000 });
    await jv.locator("[data-note-state=missing]").waitFor();
    await jv.locator("[data-library-obsidian]").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = "hidden"; }));
    await page.locator(".usb-dock").screenshot({ path: shotPath("biblioteca-falta") });
    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = ""; }));
    await jv.getByRole("button", { name: "Detalle de What is Java & JVM?" }).click();
    const lesson = jv.locator("[data-library-lesson]").filter({ has: page.locator("[data-note-state=missing]") });
    assert.match(await lesson.locator("[data-library-note-path]").innerText(), new RegExp(`Nota Cursos/Java/${javaNote.replace(/[.]/g, "\\.")}`));
    await lesson.locator("[data-library-save-note]").filter({ hasText: "Guardar otra vez" }).click();
    await toast("Nota guardada en Obsidian").waitFor();
    assert((await vault()).files[`Cursos/Java/${javaNote}`], "vuelve a su carpeta del curso");
    await jv.locator("[data-library-vault-check]").filter({ hasText: "Comprobado en el vault." }).waitFor();
    await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).click();
  });
  console.log("PASS Biblioteca: carpeta del curso (la de Fijar), lo que hay de verdad en el vault, guardar las que faltan desde el historial y la nota borrada a mano");

  // ── 8. Conectar es pegar la clave: se guarda, se comprueba y prepara el vault solo ──
  await stage("conectar pegando la clave", async () => {
    await page.evaluate(async () => {
      const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
      const cfg = (await chromeLocalStorage.get(["obsidian_export_config"])).obsidian_export_config;
      const { restApiKey, prepareVault, vaultPreparedAt, ...rest } = cfg;
      await chromeLocalStorage.set({ obsidian_export_config: rest });
      delete window.__vault.files["log.md"];
    });
    await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).dispatchEvent("click").catch(() => {});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "obsidian" } })));
    const prefs = page.locator("section[aria-label='Obsidian']");
    await prefs.locator("[data-obsidian-connection-status]").filter({ hasText: "Sin conectar · pega la clave abajo" }).waitFor({ timeout: 10000 });
    assert.equal(await prefs.getByRole("switch", { name: "Preparar el vault" }).count(), 0, "ya no es un interruptor confuso on/off");
    await prefs.getByLabel("Clave del plugin Local REST API").fill("clave-nueva");
    // Sin pulsar nada: se guarda al dejar de escribir y la conexión se comprueba sola.
    await page.waitForFunction(() => /Conectado · Obsidian 1\.9\.10/.test(document.querySelector("[data-obsidian-connection-status]")?.textContent ?? ""), null, { timeout: 10000 });
    assert((await vault()).keys.includes("clave-nueva"), "se comprobó con la clave pegada");
    await toast("Vault preparado").waitFor({ timeout: 10000 });
    const cfg = await page.evaluate(async () => (await import("/src/app/services/obsidianExport.ts")).loadObsidianExportConfig());
    assert.equal(cfg.restApiKey, "clave-nueva", "la clave quedó guardada sin botón");
    assert(cfg.prepareVault === true && typeof cfg.vaultPreparedAt === "number", "la primera clave enciende «Preparar el vault», y se hace al conectar");
    assert((await vault()).files["log.md"], "lo que faltaba (el registro) se creó; lo demás no se tocó");
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).dispatchEvent("click");
  });
  console.log("PASS Conectar = pegar la clave: se guarda y se comprueba sola, y el vault se prepara solo (una vez, sin pisar)");

  assert.deepEqual(pageErrors, [], "sin errores de ejecución");
  console.log("QA Obsidian (fase 3): OK");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
