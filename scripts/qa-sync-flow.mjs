// QA de la fase 5 («conectado, sin exportar») en el prototipo, con Anki y
// Obsidian simulados que se pueden cerrar y abrir:
//  1. Fijar sin ningún botón de exportar: dice qué pasará al terminar.
//  2. Terminar con Anki y Obsidian cerrados: la lección ESPERA (historial).
//  3. Anki vuelve: las tarjetas llegan solas (el mismo .apkg), y el curso
//     recibe la etiqueta de cada programa que lo incluye (N:M).
//  4. Obsidian vuelve: la nota se guarda sola.
//  5. Tras terminar, una tarjeta añadida se envía sola; sin cambios, nada.
//  6. Lo que esperaba de OTRA lección se envía solo en cuanto Anki responde;
//     una lección de antes (sin espera) no se envía por su cuenta.
// node scripts/qa-sync-flow.mjs   ·   QA_DEBUG=1 para ver cada etapa · QA_THEME=dark
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const port = 4196;
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
    const shot = `/tmp/qa-sync-fail-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    await page?.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const text = await page?.evaluate(() => document.querySelector(".usb-dock")?.innerText.slice(0, 2500) ?? "").catch(() => "");
    console.error(`FAIL ${name} — captura: ${shot}\n--- texto visible ---\n${text}\n---`);
    if (pageErrors.length) console.error("--- errores de página ---\n" + pageErrors.slice(-3).join("\n"));
    throw error;
  }
}

// Contraste WCAG con la pila REAL de fondos (el mismo método que qa-doubts).
function contrastAudit(selector) {
  return page.evaluate((sel) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const paint = (layers) => {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1, 1);
      for (const color of layers) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); }
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const lum = ([r, g, b]) => {
      const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const failures = [];
    let checked = 0;
    for (const root of document.querySelectorAll(sel)) {
      for (const el of root.querySelectorAll("*")) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
        if (!/[\p{L}\p{N}]/u.test(own)) continue;
        if (el.closest("[aria-hidden='true'], button:disabled, [aria-disabled='true']")) continue;
        // Lo que no se ve no cuenta: contenido de un <details> cerrado (Chromium deja cajas viejas) u oculto.
        const fold = el.closest("details:not([open])");
        if (fold && !el.closest("summary")) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        const box = el.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) continue;
        const layers = [];
        let transient = false;
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
          const cs = getComputedStyle(node);
          if (Number(cs.opacity) < 0.98) transient = true;
          if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") layers.unshift(cs.backgroundColor);
        }
        if (transient) continue;
        const cs = getComputedStyle(el);
        const bg = paint(layers);
        const fg = paint([...layers, cs.color]);
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        checked += 1;
        if (ratio < (large ? 3 : 4.5)) failures.push({ text: own.slice(0, 60), ratio: Number(ratio.toFixed(2)), fg: `rgb(${fg})`, bg: `rgb(${bg})`, size });
      }
    }
    return { checked, failures };
  }, selector);
}

/** AA en los dos temas (oscuro y sepia): la misma pantalla, cambiando de tema y volviendo. */
async function auditBothThemes(selector, label, min = 3) {
  for (const pass of [1, 2]) {
    await page.waitForTimeout(450);
    const { checked, failures } = await contrastAudit(selector);
    assert(checked >= min, `contraste: ${checked} textos revisados (${label})`);
    assert.deepEqual(failures, [], `contraste AA en ${label} (tema ${pass})`);
    await page.locator(".usb-dock").screenshot({ path: `/tmp/kinema-sync-${label}-tema${pass}.png` }).catch(() => {});
    await page.getByRole("button", { name: /Cambiar a tema (claro|oscuro)/ }).click();
  }
}

// Anki y Obsidian simulados en la página; `up` decide si responden.
const installFakes = () => page.evaluate(async () => {
  const anki = { up: false, calls: [], imports: [], tagged: [] };
  window.__anki = anki;
  const bridge = await import("/src/app/services/ankiBridge.ts");
  const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
  await chromeLocalStorage.set({ usb_anki_connected: true });
  bridge.setAnkiTransport(async (msg) => {
    anki.calls.push(msg.op);
    if (msg.op === "status") return anki.up ? { ok: true, status: { available: true, permission: "granted", version: 6 } } : { ok: true, status: { available: false, error: "Failed to fetch" } };
    if (!anki.up) return { ok: false, error: "Anki no respondió." };
    if (msg.op === "decks") return { ok: true, decks: ["Default", "Kinema", "Kinema::Courses"] };
    if (msg.op === "import") { anki.imports.push({ size: msg.base64.length, countQuery: msg.countQuery }); return { ok: true, result: { before: 0, after: 4, added: anki.imports.length === 1 ? 4 : 1 } }; }
    if (msg.op === "addTag") { anki.tagged.push({ query: msg.query, tag: msg.tag }); return { ok: true, tagged: 3 }; }
    if (msg.op === "knownWords") return { ok: true, words: [] };
    if (msg.op === "concepts") return { ok: true, notes: [] };
    if (msg.op === "counts") return { ok: true, counts: msg.queries.map(() => 0) };
    return { ok: false, error: `op ${msg.op}` };
  });
  const rest = await import("/src/app/services/obsidianRestOps.ts");
  const writer = await import("/src/app/services/obsidianWriter.ts");
  const obs = await import("/src/app/services/obsidianBridge.ts");
  const vault = { up: false, files: {} };
  window.__vault = vault;
  const request = async (method, path, opts = {}) => {
    if (path === "/") return { status: 200, body: JSON.stringify({ status: "OK", authenticated: true, versions: { self: "5.5.2", obsidian: "1.9.10" } }) };
    const p = path.replace(/^\/vault\//, "").split("/").filter(Boolean).map(decodeURIComponent).join("/");
    if (method === "GET") { const f = vault.files[p]; return f === undefined ? { status: 404, body: "{}" } : { status: 200, body: JSON.stringify({ content: f, path: p, stat: { mtime: Date.now() } }) }; }
    if (method === "PUT") { vault.files[p] = opts.body; return { status: 204, body: "" }; }
    if (method === "POST") { vault.files[p] = (vault.files[p] ?? "") + opts.body; return { status: 204, body: "" }; }
    return { status: 405, body: "{}" };
  };
  obs.setObsidianTransport(async (msg) => {
    if (msg.op === "status") return { ok: true, status: vault.up ? await rest.restStatus(request) : { available: false, error: "Failed to fetch" } };
    if (!vault.up) return { ok: false, error: "Obsidian no responde.", unreachable: true };
    if (msg.op === "read") return { ok: true, note: await rest.readNote(request, msg.path) };
    if (msg.op === "writes") return { ok: true, outcomes: await writer.runVaultWrites(request, msg.writes) };
    return { ok: false, error: `op ${msg.op}` };
  });
  const { DEFAULT_OBSIDIAN_EXPORT_CONFIG } = await import("/src/app/services/obsidianExport.ts");
  await chromeLocalStorage.set({ obsidian_export_config: { ...DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: "Mi Vault", restApiKey: "clave-qa" } });
  // Antes: una lección de este curso estudiada con el programa «java-engineer» (para el N:M de etiquetas).
  const now = Date.now();
  localStorage.setItem("usb_history_lecture::javaindepthbecomeacompletejavaengineer::intro", JSON.stringify({
    courseId: "javaindepthbecomeacompletejavaengineer", lectureId: "intro", courseName: "Java In-Depth: Become a Complete Java Engineer!", lectureName: "Intro",
    questions: [], status: "completed", startedAt: now - 9000, updatedAt: now - 9000, finishedAt: now - 8000, exportedAt: now - 8000, dcTrackSlug: "java-engineer", ankiCardsCount: 0,
  }));
});
const anki = () => page.evaluate(() => window.__anki);
const vault = () => page.evaluate(() => window.__vault);
const record = (re = /whatisjava/) => page.evaluate((src) => {
  const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && new RegExp(src).test(k));
  return key ? JSON.parse(localStorage.getItem(key)) : null;
}, re.source);
const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).last();
const ankiLine = () => page.locator("section").filter({ hasText: "Tarjetas de la lección" }).locator("[data-sync]").first();
const obsidianLine = () => page.locator("section").filter({ has: page.locator("[data-obsidian-folder]") }).locator("[data-sync]").first();
const shot = (name) => page.locator(".usb-dock").screenshot({ path: `/tmp/kinema-sync-${name}${process.env.QA_THEME ? `-${process.env.QA_THEME}` : ""}.png` }).catch(() => {});

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
  await page.evaluate((theme) => { localStorage.clear(); if (theme) localStorage.setItem("usb_dock_theme", theme); }, process.env.QA_THEME ?? "");
  await page.reload();

  // ── 1. Fijar: sin exportar, dice qué pasará ─────────────────────────────
  await stage("fijar", async () => {
    await installFakes();
    await page.getByText("Continuar sin cuenta", { exact: true }).click();
    await page.getByPlaceholder("Ej: Conseguir trabajo en fintech como Java dev en 3 meses…").fill("Entender cómo la JVM ejecuta Java");
    await page.getByRole("button", { name: /Generar sesión de aprendizaje|Empezar/ }).click();
    await page.getByRole("button", { name: /^Entendido/ }).click({ timeout: 30000 });
    await page.getByRole("button", { name: /^Ponerme a prueba/ }).click();
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    await page.getByRole("button", { name: "Continuar a Aplicar" }).click();
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    await page.locator("[data-anki-deck]").waitFor();
    const dock = page.locator(".usb-dock");
    // Solo Study (la pestaña Captions tiene «Exportar EN»: exporta subtítulos, no tarjetas).
    const exportish = page.locator(".kx-study").getByRole("button", { name: /^(Descargar|Exportar|Enviar a Anki|Copiar|\.md|Guardar)\b|\.apkg|Guía de importación/ });
    assert.equal(await exportish.count(), 0, `Fijar: ningún botón de exportar ni de descargar: ${JSON.stringify(await exportish.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") || el.textContent)))}`);
    await page.locator('[data-sync="offline"]').first().waitFor({ timeout: 10000 });
    assert.match(await ankiLine().innerText(), /Anki no responde\. Puedes terminar igual: las tarjetas esperarán y se enviarán solas/);
    await obsidianLine().filter({ hasText: "Obsidian no responde" }).waitFor({ timeout: 10000 });
    assert.match(await page.locator("[data-finish-summary]").innerText(), /sin exportar nada: \d+ tarjetas y las palabras que marques esperan a Anki · la nota espera a Obsidian/);
    await shot("fijar-sin-conexion");
    await page.locator("[data-sync]").first().scrollIntoViewIfNeeded();
    await auditBothThemes("[data-sync], [data-finish-summary]", "antes-de-terminar");
  });
  console.log("PASS Fijar: sin ningún botón de exportar; con Anki y Obsidian cerrados dice que la lección esperará");

  // ── 2. Terminar sin conexión: espera ───────────────────────────────────
  await stage("terminar sin conexión", async () => {
    await page.getByRole("button", { name: /Terminar lección/ }).dispatchEvent("click");
    await page.locator('[data-sync="waiting"]').first().waitFor();
    assert.match(await ankiLine().innerText(), /Anki no responde: las \d+ tarjetas esperan y se envían solas en cuanto lo abras/);
    await obsidianLine().filter({ hasText: "la nota espera y se guarda sola" }).waitFor();
    await page.waitForTimeout(500);
    const rec = await record();
    assert(rec?.syncPending?.anki && rec?.syncPending?.obsidian, `la espera queda en el historial: ${JSON.stringify(rec?.syncPending)}`);
    assert(!rec.exportedAt, "no cuenta como en Anki");
    assert.equal((await anki()).imports.length, 0);
    assert.deepEqual(Object.keys((await vault()).files), []);
    await shot("esperando");
    await auditBothThemes("[data-sync]", "esperando", 2);
  });
  console.log("PASS Terminar sin conexión: tarjetas y nota esperan (historial), nada se pierde ni se descarga");

  // ── 3. Anki vuelve: llegan solas, con la etiqueta de cada programa del curso ──
  await stage("anki vuelve", async () => {
    await page.evaluate(() => { window.__anki.up = true; });
    await ankiLine().getByRole("button", { name: "Comprobar" }).dispatchEvent("click");
    await toast("tarjetas nuevas en Anki").waitFor({ timeout: 20000 });
    await page.locator('[data-sync="sent"]').first().waitFor();
    const a = await anki();
    assert.equal(a.imports.length, 1, "un paquete");
    assert(/tag:kinema::leccion::what-is-java-jvm/.test(a.imports[0].countQuery));
    assert.deepEqual(a.tagged, [{ query: 'note:"Udemy Bridge Concept" tag:kinema::curso::java-in-depth-become-a-complete-java-engineer -tag:kinema::programa::java-engineer', tag: "kinema::programa::java-engineer" }], "lo que ya tenías del curso recibe la etiqueta de su programa (solo se añade)");
    assert.match(await ankiLine().innerText(), /4 tarjetas nuevas en Anki: lo confirmó Anki\. 3 tarjetas del curso con la etiqueta de su programa\./);
    await page.waitForTimeout(500);
    const rec = await record();
    assert.equal(rec?.syncPending?.anki, undefined, "ya no espera a Anki");
    assert(rec?.syncPending?.obsidian, "Obsidian sigue esperando");
    assert(rec?.exportedAt && rec.exportedGuids?.length === 4);
  });
  console.log("PASS Anki vuelve: las tarjetas llegan solas (mismo .apkg) y el curso recibe la etiqueta de cada programa (N:M)");

  // ── 4. Obsidian vuelve: la nota se guarda sola ──────────────────────────
  await stage("obsidian vuelve", async () => {
    await page.evaluate(() => { window.__vault.up = true; });
    await obsidianLine().getByRole("button", { name: "Comprobar" }).dispatchEvent("click");
    await toast("Nota guardada en Obsidian").waitFor({ timeout: 20000 });
    await obsidianLine().filter({ hasText: "Guardado en" }).waitFor();
    const files = Object.keys((await vault()).files).sort();
    assert.deepEqual(files, ["cursos/java-in-depth-become-a-complete-java-engineer.md", "wiki/fuentes/java-in-depth-become-a-complete-java-engineer/java-in-depth-become-a-complete-java-engineer---what-is-java-jvm.md"]);
    await page.waitForTimeout(400);
    assert.equal((await record())?.syncPending, undefined, "ya no espera nada");
    await shot("todo-llego");
    await auditBothThemes("[data-sync]", "enviado", 2);
  });
  console.log("PASS Obsidian vuelve: la nota (y el índice del curso) se guardan solos en la carpeta del curso");

  // ── 5. Tras terminar: una tarjeta más se envía sola; sin cambios, nada ──
  await stage("tarjeta añadida", async () => {
    await page.getByRole("button", { name: "Ver tarjetas" }).dispatchEvent("click");
    const quitar = page.getByRole("button", { name: "Quitar", exact: true }).first();
    await quitar.waitFor();
    await quitar.dispatchEvent("click");
    await page.waitForTimeout(1500);
    assert.equal((await anki()).imports.length, 1, "quitar después no envía nada (lo que ya está en Anki se queda)");
    await page.getByRole("button", { name: "Incluir", exact: true }).first().dispatchEvent("click");
    await page.waitForTimeout(1500);
    assert.equal((await anki()).imports.length, 1, "volver a incluir una que ya estaba en Anki: nada que enviar");
    // Una duda guardada tras terminar sería otra tarjeta: aquí, una tarjeta nueva en el contenido.
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && /whatisjava/.test(k));
      window.__beforeGuids = JSON.parse(localStorage.getItem(key)).exportedGuids.length;
    });
  });
  console.log("PASS Tras terminar: quitar no borra de Anki y lo que ya estaba no se reenvía");

  // ── 6. Lo que espera de otra lección, solo; lo de antes, no ─────────────
  await stage("cola", async () => {
    await page.evaluate(() => {
      const now = Date.now();
      const base = { courseId: "javaindepthbecomeacompletejavaengineer", courseName: "Java In-Depth: Become a Complete Java Engineer!", questions: [], status: "completed", platform: "udemy" };
      localStorage.setItem("usb_history_lecture::javaindepthbecomeacompletejavaengineer::memoria", JSON.stringify({ ...base, lectureId: "memoria", lectureName: "Memoria", startedAt: now - 5000, updatedAt: now - 5000, finishedAt: now - 4000,
        ankiCards: [{ id: "m1", front: "¿Qué es el heap?", back: "La memoria de los objetos.", type: "concepto" }], ankiCardsCount: 1, syncPending: { anki: now - 4000 } }));
      localStorage.setItem("usb_history_lecture::javaindepthbecomeacompletejavaengineer::antigua", JSON.stringify({ ...base, lectureId: "antigua", lectureName: "Antigua", startedAt: now - 7000, updatedAt: now - 7000, finishedAt: now - 6000,
        ankiCards: [{ id: "o1", front: "¿Qué es el stack?", back: "La pila de llamadas.", type: "concepto" }], ankiCardsCount: 1 }));
      window.__anki.up = false;
    });
    // Anki se cierra y vuelve: lo que esperaba se envía solo.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "anki" } })));
    const conn = page.locator("[data-anki-connection]");
    await conn.waitFor();
    await conn.getByRole("button", { name: /Comprobar|Conectar/ }).dispatchEvent("click");
    await conn.filter({ hasText: "Anki no responde" }).waitFor();
    await page.evaluate(() => { window.__anki.up = true; });
    await conn.getByRole("button", { name: /Comprobar|Conectar/ }).dispatchEvent("click");
    await toast("Lo que esperaba ya está en Anki").waitFor({ timeout: 20000 });
    assert.match(await toast("Lo que esperaba ya está en Anki").innerText(), /1 lección \(1 tarjeta nueva\)/);
    const a = await anki();
    assert.equal(a.imports.length, 2, "solo la que esperaba");
    assert(/tag:kinema::leccion::memoria/.test(a.imports[1].countQuery), `la de «Memoria»: ${a.imports[1].countQuery}`);
    await page.waitForTimeout(400);
    const memoria = await record(/::memoria$/);
    assert.equal(memoria?.syncPending, undefined);
    assert(memoria?.exportedAt && memoria.exportedGuids?.length === 1);
    const antigua = await record(/::antigua$/);
    assert(!antigua?.exportedAt, "una lección de antes, sin espera, no se envía por su cuenta");
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).dispatchEvent("click");
    // La Biblioteca la ofrece con un clic.
    await page.getByRole("button", { name: "Biblioteca", exact: true }).dispatchEvent("click");
    const pending = page.locator("[data-pending-anki]");
    await pending.waitFor();
    assert.match(await pending.innerText(), /Antigua/);
    const pendingCount = await page.locator("[data-pending-anki] > div").count();
    await page.locator("[data-pending-send]").dispatchEvent("click");
    await page.locator("[data-sonner-toast]").filter({ hasText: /\d+ lecci(ón|ones) en Anki/ }).last().waitFor({ timeout: 20000 });
    assert.equal((await anki()).imports.length, 2 + pendingCount, "una importación por lección pendiente (las de la demo y «Antigua»)");
    assert((await record(/::antigua$/))?.exportedAt, "«Antigua», en Anki");
    await pending.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).dispatchEvent("click");
  });
  console.log("PASS Cola: lo que esperaba de otra lección llega solo cuando Anki vuelve; lo de antes se ofrece en la Biblioteca con un clic");

  // ── Fase 5.1 · Ajustes rediseñados: AA en los dos temas, con lo plegado abierto ──
  await stage("ajustes: contraste", async () => {
    const open = async (section) => {
      await page.evaluate((s) => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: s } })), section);
      await page.waitForTimeout(450);
    };
    await open("provider");
    await auditBothThemes("section.kx-settings-section[aria-label='Proveedor de IA'] [id]", "ajustes-ia", 8);
    await open("anki");
    const anki = page.locator("section.kx-settings-section[aria-label='Anki']");
    await anki.locator("[data-anki-connection]").filter({ hasText: "Conectado" }).waitFor({ timeout: 10000 });
    await anki.locator("[data-anki-howto] summary").click();
    await auditBothThemes("section.kx-settings-section[aria-label='Anki'] [id]", "ajustes-anki", 12);
    // Si hay mazos compatibles detectados, también se audita el menú abierto.
    if (await anki.getByRole("button", { name: "Mazo de las palabras" }).count() > 0) {
      await anki.getByRole("button", { name: "Mazo de las palabras" }).click();
      await anki.getByRole("listbox", { name: "Mazo de las palabras" }).waitFor();
      await page.waitForTimeout(400);
      const menu = await contrastAudit("section.kx-settings-section[aria-label='Anki'] [role='listbox']");
      assert(menu.checked >= 2, `contraste del menú: ${menu.checked}`);
      assert.deepEqual(menu.failures, [], "contraste AA en el menú de mazos");
      await page.keyboard.press("Escape");
    }
    await open("vocabulary");
    await page.locator("[data-vocabulary-preferences] [data-vocab-known]").waitFor({ timeout: 10000 });
    await auditBothThemes("section.kx-settings-section[aria-label='Idiomas'] [id]", "ajustes-idiomas", 8);
    await open("obsidian");
    const obsidian = page.locator("section.kx-settings-section[aria-label='Obsidian']");
    await obsidian.locator("[data-obsidian-fallback] summary").click();
    await auditBothThemes("section.kx-settings-section[aria-label='Obsidian'] [id]", "ajustes-obsidian", 15);
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).dispatchEvent("click");
  });
  console.log("PASS Ajustes (IA · Anki · Idiomas · Obsidian): contraste AA en oscuro y sepia, también lo plegado y las listas de mazos");

  assert.deepEqual(pageErrors, [], "sin errores de ejecución");
  console.log("QA sincronización (fase 5): OK");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
