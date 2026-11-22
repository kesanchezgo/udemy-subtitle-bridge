// QA de la fase 4 (duplicados de conceptos contra el mazo) en el prototipo.
// 1. Sin Anki: el mazo sale del historial (la demo siembra «Arquitectura de la
//    JVM», exportada). La lección «JIT y rendimiento en caliente» repite dos de
//    sus ideas (una con el mismo frente, otra con el mismo título): Fijar dice
//    «2 ideas ya estaban en tu mazo», el paquete que llega a Anki al terminar
//    (fase 5: sin exportar) no las lleva, «Añadir igualmente» sí (y se envía
//    sola), la nota de Obsidian lo cuenta, la Biblioteca también, y al recargar
//    sale lo mismo.
// 2. Con Anki conectado (AnkiConnect simulado con las operaciones REALES del
//    service worker): el mazo sale de Anki, las que hoy no salieron dicen su
//    estado real y «Repasar hoy en Anki (1)» solo cambia la tarjeta en repaso,
//    con setDueDate "0"; la nueva no se toca.
// node scripts/qa-deck-flow.mjs   ·   QA_DEBUG=1 para ver cada etapa · QA_THEME=dark|sepia
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
import JSZip from "jszip";
import initSqlJs from "sql.js";

const port = 4194;
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
    const shot = `/tmp/qa-deck-fail-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    await page?.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const text = await page?.evaluate(() => document.body.innerText.slice(0, 2500)).catch(() => "");
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

const COURSE = "Java In-Depth: Become a Complete Java Engineer!";
const JIT = "JIT y rendimiento en caliente";
const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).last();
const record = () => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && /jityrendimientoencaliente/.test(k));
  return key ? JSON.parse(localStorage.getItem(key)) : null;
});
const shotPath = (name) => `/tmp/kinema-deck-${name}${process.env.QA_THEME ? `-${process.env.QA_THEME}` : ""}.png`;
let SQL;
const readApkg = async (download) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()));
  const db = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
  const rows = db.exec("SELECT guid, flds, tags FROM notes")[0]?.values ?? [];
  db.close();
  return rows.map(([guid, flds, tags]) => ({ guid, front: String(flds).split("\x1f")[0], fields: String(flds), tags: String(tags) }));
};
/** Fase 5: el paquete que llega a Anki (AnkiConnect simulado), leído igual que una descarga. */
const readImported = async (index) => {
  const base64 = await page.evaluate((i) => window.__imports[i], index);
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  const db = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
  const rows = db.exec("SELECT guid, flds, tags FROM notes")[0]?.values ?? [];
  db.close();
  return rows.map(([guid, flds, tags]) => ({ guid, front: String(flds).split("\x1f")[0], fields: String(flds), tags: String(tags) }));
};
const waitImports = (n) => page.waitForFunction((count) => (window.__imports?.length ?? 0) >= count, n, { timeout: 30000 });
/** Anki se abre (después de calcular el mazo con el historial): solo recibe paquetes. */
const installImportAnki = () => page.evaluate(async () => {
  const bridge = await import("/src/app/services/ankiBridge.ts");
  const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
  window.__imports = [];
  await chromeLocalStorage.set({ usb_anki_connected: true });
  bridge.setAnkiTransport(async (msg) => {
    if (msg.op === "status") return { ok: true, status: { available: true, permission: "granted", version: 6 } };
    if (msg.op === "decks") return { ok: true, decks: ["Default", "Kinema"] };
    if (msg.op === "import") { window.__imports.push(msg.base64); return { ok: true, result: { before: 0, after: 2, added: window.__imports.length === 1 ? 2 : 1 } }; }
    if (msg.op === "addTag") return { ok: true, tagged: 0 };
    if (msg.op === "knownWords") return { ok: true, words: [] };
    if (msg.op === "counts") return { ok: true, counts: msg.queries.map(() => 0) };
    return { ok: false, error: `op ${msg.op}` };
  });
});

/** Del objetivo a Fijar con la lección JIT, saltando Comprobar y Aplicar (las ideas quedan «No del todo»). */
async function reachFijar() {
  await page.getByText("Continuar sin cuenta", { exact: true }).click();
  const edit = page.getByRole("button", { name: /Editar curso o lección/ });
  await page.getByPlaceholder("Ej: Conseguir trabajo en fintech como Java dev en 3 meses…").waitFor();
  if (await edit.isVisible().catch(() => false)) await edit.click();
  await page.getByPlaceholder("Nombre del video/clase actual").fill(JIT);
  await page.getByPlaceholder("Ej: Conseguir trabajo en fintech como Java dev en 3 meses…").fill("Defender el rendimiento de un servicio Java");
  await page.getByRole("button", { name: /Generar sesión de aprendizaje|Empezar/ }).click();
  await page.getByRole("button", { name: /^Entendido/ }).click({ timeout: 30000 });
  await page.getByRole("button", { name: /^Ponerme a prueba/ }).click();
  await page.getByRole("button", { name: "Saltar este paso" }).click();
  await page.getByRole("button", { name: "Continuar a Aplicar" }).click();
  await page.getByRole("button", { name: "Saltar este paso" }).click();
  await page.locator("[data-deck-dups]").waitFor({ timeout: 15000 });
}

async function openPage(theme) {
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.route("**/src/main.tsx", (route) => route.fulfill({ contentType: "application/javascript", body: 'import React from "/node_modules/.vite/deps/react.js"; import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js"; import App from "/src/app/App.tsx"; import "/src/styles/index.css"; ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));' }));
  await page.goto(url);
  await page.evaluate((t) => { localStorage.clear(); if (t) localStorage.setItem("usb_dock_theme", t); }, theme ?? "");
  await page.reload();
}

async function auditBothThemes(selector, label, min = 6) {
  for (const pass of [1, 2]) {
    await page.waitForTimeout(450);
    const { checked, failures } = await contrastAudit(selector);
    assert(checked >= min, `contraste: ${checked} textos revisados (${label})`);
    assert.deepEqual(failures, [], `contraste AA en ${label} (tema ${pass})`);
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.locator(".usb-dock").screenshot({ path: shotPath(`${label}-tema${pass}`) }).catch(() => {});
    await page.getByRole("button", { name: /Cambiar a tema (claro|oscuro)/ }).click();
  }
}

try {
  SQL = await initSqlJs();
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  await fetch(`${url}/src/main.tsx`).catch(() => {});
  for (let i = 0; i < 600; i++) {
    const ok = await Promise.all(["react.js", "react-dom_client.js"].map((f) => fetch(`${url}/node_modules/.vite/deps/${f}`).then((r) => r.ok, () => false)));
    if (ok.every(Boolean)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });

  // ── 1. Sin Anki: el mazo según el historial ───────────────────────────────
  await openPage(process.env.QA_THEME);
  await stage("fijar con historial", async () => {
    await reachFijar();
    const block = page.locator("[data-deck-dups]");
    assert.equal(await block.getAttribute("data-deck-source"), "historial");
    assert.equal(await block.locator("[data-deck-dups-heading]").textContent(), "2 ideas ya estaban en tu mazo");
    const text = await block.innerText();
    assert(text.includes("No se duplican: mantienen su progreso en Anki"), `lo dice con honestidad: ${text}`);
    assert(text.includes("según tu historial local"), "dice de dónde lo sabe");
    const rows = await block.locator("[data-deck-dup]").evaluateAll((els) => els.map((el) => el.getAttribute("data-deck-dup")));
    assert.deepEqual(rows, ["0", "1"], "las dos ideas: la del mismo título y la del mismo frente");
    assert(text.includes("Qué es un hot spot") && text.includes("Tu tarjeta de «Arquitectura de la JVM»: ¿Qué es un hot spot para el JIT?"), text);
    assert(text.includes("Tu tarjeta de «Arquitectura de la JVM»: ¿Por qué una app Java va más rápida tras unos minutos (warm-up)?"), text);
    assert.equal(await block.locator("[data-deck-dup-weak]").count(), 2, "sin responder en Recordar = no salió hoy");
    assert(text.includes("Anki la repasará cuando le toque."), "sin Anki: no se promete adelantarla");
    assert.equal(await block.locator("[data-deck-review-today]").count(), 0, "sin Anki conectado no hay «Repasar hoy en Anki»");
    const why = await page.locator("[data-cards-why]").innerText();
    assert(/^4\/4 ideas cubiertas \(2 ya en tu mazo\)/.test(why), `cobertura con el mazo: ${why}`);
    assert.match(await page.getByText(/^\d+ tarjetas/).first().innerText(), /^2 tarjetas/, "el paquete lleva solo las 2 ideas nuevas");
    await auditBothThemes("[data-deck-dups]", "fijar-historial");
  });
  console.log("PASS Fijar sin Anki: «2 ideas ya estaban en tu mazo» (mismo frente y mismo título, del historial), se practicaron igual, cobertura con el mazo, sin promesas de Anki, contraste AA en los dos temas");

  await stage("exportar y añadir igualmente", async () => {
    // Sin tarjetas aceptadas no llega a Anki un paquete vacío (y se dice por qué).
    await page.getByRole("button", { name: "Ver tarjetas" }).click();
    const previewCard = page.locator("[aria-label='Ver reverso de la tarjeta'], [aria-label='Ver frente de la tarjeta']").first();
    const removed = [];
    for (let i = 0; i < 6; i++) {
      const inDeck = await previewCard.locator("[data-card-in-deck]").count();
      const quitar = page.getByRole("button", { name: "Quitar", exact: true });
      if (!inDeck && await quitar.count()) { removed.push(i); await quitar.click(); }
      await page.getByRole("button", { name: "Tarjeta siguiente" }).click();
    }
    assert.equal(removed.length, 2, "se quitan las dos nuevas");
    await page.locator('[data-sync="empty"]').waitFor();
    // Se quitaron a mano: no se dice que «todo ya estaba en tu mazo» (eso solo si de verdad lo estaba).
    assert.equal(await page.locator('[data-sync="empty"]').innerText(), "No hay tarjetas para Anki: incluye alguna en «Ver tarjetas».");
    assert.doesNotMatch(await page.locator("[data-next-step]").innerText(), /ya está en tu mazo/);
    for (let i = 0; i < 6; i++) {
      const inDeck = await previewCard.locator("[data-card-in-deck]").count();
      const incluir = page.getByRole("button", { name: "Incluir", exact: true });
      if (!inDeck && await incluir.count()) await incluir.click();
      await page.getByRole("button", { name: "Tarjeta siguiente" }).click();
    }
    await page.locator('[data-sync="empty"]').waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Ocultar tarjetas" }).click();
    // Anki se abre y se conecta (una vez, en Ajustes); al terminar, el paquete llega solo.
    await installImportAnki();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "anki" } })));
    await page.locator("[data-anki-connection]").getByRole("button", { name: /Conectar|Comprobar/ }).dispatchEvent("click");
    await page.locator("[data-anki-connection]").filter({ hasText: "Conectado" }).waitFor();
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).dispatchEvent("click");
    await page.locator('[data-sync="ready"]').first().waitFor();
    assert.equal(await page.evaluate(() => window.__imports.length), 0, "nada llega antes de terminar");
    await page.getByRole("button", { name: /Terminar lección/ }).dispatchEvent("click");
    await waitImports(1);
    const first = await readImported(0);
    assert.deepEqual(first.map((n) => n.front).sort(), [
      "¿Por qué la JVM interpreta al principio en vez de compilarlo todo a nativo?",
      "¿Qué hay que hacer antes de medir el rendimiento de un método Java?",
    ], "el paquete no duplica lo que ya está en el mazo");
    assert(first.every((n) => /(^|\s)kinema::plataforma::udemy(\s|$)/.test(n.tags) && !n.tags.includes("kinema/platform")), `etiquetas de ahora: ${first[0].tags}`);
    await page.locator('[data-sync="sent"]').first().waitFor();
    // Vista previa: la de cobertura de la idea 0 está, marcada, para incluirla si se quiere.
    await page.getByRole("button", { name: "Ver tarjetas" }).click();
    const preview = page.locator("[aria-label='Ver reverso de la tarjeta'], [aria-label='Ver frente de la tarjeta']").first();
    for (let i = 0; i < 6 && !(await preview.locator("[data-card-in-deck]").count()); i++) await page.getByRole("button", { name: "Tarjeta siguiente" }).click();
    assert.equal(await preview.locator("[data-card-in-deck]").innerText(), "Ya en tu mazo");
    assert.equal(await page.getByRole("button", { name: "Incluir", exact: true }).count(), 1, "fuera del paquete por defecto");
    await page.getByRole("button", { name: "Ocultar tarjetas" }).click();
    // «Añadir igualmente» en la idea 0, con la lección ya terminada: se envía sola.
    const toggle = page.locator('[data-deck-dup="0"] [data-deck-dup-toggle]');
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    await toggle.dispatchEvent("click");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal(await toggle.innerText(), "Añadida · Quitar");
    await waitImports(2);
    const second = await readImported(1);
    const added = second.find((n) => n.front === "¿Qué convierte un método en un hot spot para el JIT?");
    assert(added && added.tags.includes("kinema::reforzar"), `la añadida va, como refuerzo (no salió hoy): ${second.map((n) => n.front).join(" | ")}`);
    assert.equal(second.length, 3);
    assert(first.every((n) => second.some((m) => m.guid === n.guid)), "las demás conservan su GUID (Anki no las duplica)");
    await page.locator('[data-sync="sent"]').filter({ hasText: "1 tarjeta nueva en Anki" }).first().waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.__imports.length), 2, "sin cambios, no se reenvía");
    const rec = await record();
    const matches = rec?.studyContent?.deckMatches ?? [];
    assert.deepEqual(matches.map((m) => [m.idea, m.via, m.source, m.lesson]), [[0, "titulo", "historial", "Arquitectura de la JVM"], [1, "frente", "historial", "Arquitectura de la JVM"]], `historial: ${JSON.stringify(matches)}`);
    assert.deepEqual(rec.ankiCards.filter((c) => c.inDeck).map((c) => [c.id, Boolean(c.excluded)]).sort(), [["card-001", true], ["study-cobertura-q0", false]], "en el historial: cuáles eran del mazo y cuál se añadió igualmente");
    assert.equal(rec.exportedGuids.length, 3, "en Anki: las 3");
  });
  console.log("PASS Sin tarjetas aceptadas no llega a Anki un paquete vacío (y se dice por qué); al terminar llega solo y sin duplicados; «Añadir igualmente» después de terminar se envía sola (de refuerzo, mismos GUID) y el historial guarda qué ideas ya estaban y cuál se añadió");

  await stage("nota y biblioteca", async () => {
    // Fase 5: la nota que se guarda sola (desde el historial: la misma que la espera y la Biblioteca).
    const md = await page.evaluate(async (lesson) => {
      const { historyService } = await import("/src/app/services/historyService.ts");
      const { sessionDataFromRecord } = await import("/src/app/services/obsidianSession.ts");
      const { buildSessionNoteMarkdown, DEFAULT_OBSIDIAN_EXPORT_CONFIG } = await import("/src/app/services/obsidianExport.ts");
      const rec = (await historyService.listLectures()).find((r) => r.lectureName === lesson);
      return buildSessionNoteMarkdown(sessionDataFromRecord(rec, { includeCards: true }), { ...DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: "Mi Vault" });
    }, JIT);
    assert(md.includes("**Qué es un hot spot** — código que se ejecuta tanto que al JIT le compensa compilarlo a nativo · _ya en tu mazo: [[java-in-depth-become-a-complete-java-engineer---arquitectura-de-la-jvm|Arquitectura de la JVM]]_"), `la nota enlaza con la lección donde está la tarjeta:\n${md.split("\n").filter((l) => l.includes("mazo")).join("\n")}`);
    assert(md.includes("· 2 ideas ya estaban en tu mazo"), "el resultado lo cuenta");
    assert(md.includes("¿Qué convierte un método en un hot spot para el JIT?"), "la añadida igualmente está entre las tarjetas de la nota");
    assert(!md.includes("¿Por qué una app Java va más rápida tras unos minutos (warm-up)?\n"), "la del mazo no se repite como tarjeta de esta lección");
    // Biblioteca: la lección y el curso lo dicen.
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    const list = page.getByRole("region", { name: "Cursos estudiados" });
    await list.waitFor();
    await list.locator("button[aria-expanded]").filter({ hasText: "Java In-Depth" }).click();
    const course = page.locator("[data-library-course]").filter({ has: page.locator("[data-library-in-deck-course]") });
    await course.waitFor();
    assert.equal(await course.locator("[data-library-in-deck-course]").innerText(), "2 ideas ya estaban en tu mazo al estudiarlas: se practicaron sin duplicar tarjetas.");
    const lesson = course.locator("[data-library-lesson]").filter({ has: page.locator("[data-library-in-deck]") });
    assert.equal(await lesson.locator("[data-library-in-deck]").innerText(), "2 ya en tu mazo");
    await lesson.getByRole("button", { name: `Detalle de ${JIT}` }).click();
    const detail = await lesson.locator("[data-library-in-deck-detail]").innerText();
    assert(detail.includes("¿Qué es un hot spot para el JIT? · de «Arquitectura de la JVM»"), detail);
    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = "hidden"; }));
    await page.locator(".usb-dock").screenshot({ path: shotPath("biblioteca") }).catch(() => {});
    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = ""; }));
    // Lo nuevo de la fase 4, también con la fila bajo el ratón (fondo de hover).
    await lesson.locator("[data-library-in-deck]").hover();
    const hovered = await contrastAudit("[data-library-in-deck]");
    assert.deepEqual(hovered.failures, [], "la insignia «ya en tu mazo» cumple AA también con la fila resaltada");
    await page.mouse.move(0, 0);
    await auditBothThemes("[data-library-in-deck-course], [data-library-in-deck-detail], [data-library-in-deck]", "biblioteca", 4);
    await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).click();
  });
  console.log("PASS Nota de Obsidian (la idea enlaza con la lección donde está su tarjeta y el resultado lo cuenta) y Biblioteca (curso, lección y detalle)");

  await stage("recarga", async () => {
    await page.reload();
    // La demo vuelve a la lección del vídeo: la JIT se abre desde la Biblioteca (restaurar del historial).
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    const list = page.getByRole("region", { name: "Cursos estudiados" });
    await list.waitFor();
    await list.locator("button[aria-expanded]").filter({ hasText: "Java In-Depth" }).click();
    await page.getByTitle(`Abrir «${JIT}» en Study`).click();
    await page.locator("[data-deck-dups]").waitFor({ timeout: 30000 });
    assert.equal(await page.locator("[data-deck-dups-heading]").textContent(), "2 ideas ya estaban en tu mazo", "al restaurar no se recalcula (sus propias tarjetas ya estarían en el mazo)");
    assert.equal(await page.locator('[data-deck-dup="0"] [data-deck-dup-toggle]').getAttribute("aria-pressed"), "true", "lo añadido igualmente se recuerda");
    assert.equal(await page.locator('[data-deck-dup="1"] [data-deck-dup-toggle]').getAttribute("aria-pressed"), "false");
  });
  console.log("PASS Recarga: mismas ideas «ya en tu mazo» y la elección «Añadir igualmente» se conserva");

  await stage("descargar de nuevo desde la Biblioteca", async () => {
    // El enlace y la plataforma son los de ESA lección (los del historial), no los de la página abierta.
    const LESSON_URL = "https://campus.datacamp.com/courses/java-jit/chapter-1?ex=3";
    const accepted = await page.evaluate(async ({ lesson, url }) => {
      const { historyService } = await import("/src/app/services/historyService.ts");
      const rec = (await historyService.listLectures()).find((r) => r.lectureName === lesson);
      await historyService.upsertLecture({ courseId: rec.courseId, lectureId: rec.lectureId, courseName: rec.courseName, lectureName: rec.lectureName, lessonUrl: url, platform: "datacamp" });
      return (rec.ankiCards ?? []).filter((c) => !c.excluded).map((c) => c.front);
    }, { lesson: JIT, url: LESSON_URL });
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    const list = page.getByRole("region", { name: "Cursos estudiados" });
    await list.waitFor();
    const toggle = list.locator("button[aria-expanded]").filter({ hasText: "Java In-Depth" });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const row = page.locator("[data-library-lesson]").filter({ hasText: JIT });
    const download = page.waitForEvent("download");
    await row.getByRole("button", { name: /tarjetas ya en Anki\. Descargar de nuevo/ }).click();
    const notes = await readApkg(await download);
    assert.equal(notes.length, accepted.length, "solo las aceptadas (las que ya estaban en tu mazo, no)");
    assert(notes.every((n) => n.tags.includes("kinema::plataforma::datacamp")), "la plataforma de la lección (fase 5: kinema::plataforma)");
    assert(notes.every((n) => n.fields.includes(`href="${LESSON_URL.split("?")[0]}`) && !n.fields.includes("localhost")), "«Repasar esta lección» lleva a esa lección, no a la página abierta");
    assert(notes.every((n) => /kinema::tipo::[a-z]/.test(n.tags) && !/kinema::tipo::concept(\s|$)/.test(n.tags)), "tipo con el nombre de siempre (concepto, no concept)");
    await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).click();
  });
  console.log("PASS Sin AnkiConnect, el respaldo de la Biblioteca (.apkg): solo las aceptadas, con el enlace y la plataforma de esa lección (no los de la página abierta)");
  await page.close();

  // ── 2. Con Anki conectado: el mazo real y «Repasar hoy en Anki» ──────────
  await openPage(process.env.QA_THEME);
  await stage("fijar con Anki", async () => {
    await page.evaluate(async (course) => {
      const ops = await import("/src/app/services/ankiConnectOps.ts");
      const bridge = await import("/src/app/services/ankiBridge.ts");
      const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
      await chromeLocalStorage.set({ usb_anki_connected: true });
      const model = "Udemy Bridge Concept";
      const lesson = "Arquitectura de la JVM";
      const tags = ["kinema::curso::java-in-depth-become-a-complete-java-engineer", "kinema::leccion::arquitectura-de-la-jvm"];
      // Una tarjeta por nota. 1001 en repaso (no toca hoy) · 1002 nueva · 1003 en repaso.
      const notes = [
        { id: 1001, front: "¿Qué es un <em>hot spot</em> para el JIT?", lesson, tags: [...tags, "kinema::tema::jit"], model, type: "review", queue: "active", due: false },
        { id: 1002, front: "¿Por qué una app Java va más rápida tras unos minutos (warm-up)?", lesson, tags, model, type: "new", queue: "active", due: false },
        { id: 1003, front: "¿Dónde viven los objetos creados con <code>new</code>?", lesson, tags, model, type: "review", queue: "active", due: false },
      ];
      // Otro curso con EXACTAMENTE el mismo frente que 1001: entre cursos sin relación no cuenta por frente.
      const otherNotes = [{ id: 2001, front: "¿Qué es un <em>hot spot</em> para el JIT?", lesson: "Select", tags: ["kinema::curso::intro-to-sql", "kinema::leccion::select"], model, type: "review", queue: "active", due: false }];
      const all = [...notes, ...otherNotes];
      const log = [];
      window.__anki = { log, notes };
      const flag = (q, t) => new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(q);
      const matches = (q, n) => {
        const nid = q.match(/nid:(\d+)/);
        if (nid && Number(nid[1]) !== n.id) return false;
        if (q.includes(`note:"${model}"`) && n.model !== model) return false;
        const v = { "is:review": n.type === "review", "is:learn": n.type === "learning", "is:new": n.type === "new", "is:due": n.due && n.type !== "new", "is:suspended": n.queue === "suspended", "is:buried": n.queue === "buried" };
        const clean = q.replace("(is:suspended OR is:buried)", " ");
        for (const [t, val] of Object.entries(v)) { if (flag(clean, `-${t}`) && val) return false; if (flag(clean, t) && !val) return false; }
        return !q.includes("(is:suspended OR is:buried)") || v["is:suspended"] || v["is:buried"];
      };
      const invoke = async (action, params = {}) => {
        log.push({ action, params: JSON.parse(JSON.stringify(params)) });
        if (action === "findNotes") {
          if (params.query.includes("-tag:kinema::curso::java-in-depth-become-a-complete-java-engineer")) return otherNotes.map((n) => n.id);
          return params.query.includes("tag:kinema::curso::java-in-depth-become-a-complete-java-engineer") ? notes.map((n) => n.id) : [];
        }
        if (action === "notesInfo") return params.notes.map((id) => all.find((n) => n.id === id)).filter(Boolean).map((n) => ({ noteId: n.id, tags: n.tags, fields: { Front: { value: n.front, order: 0 }, Back: { value: "b", order: 1 }, Leccion: { value: n.lesson, order: 2 } } }));
        if (action === "findCards") return all.filter((n) => matches(params.query, n)).map((n) => n.id * 10);
        if (action === "setDueDate") { for (const id of params.cards) { const n = notes.find((x) => x.id * 10 === id); if (n) n.due = true; } return true; }
        throw new Error(`acción ${action}`);
      };
      bridge.setAnkiTransport(async (msg) => {
        try {
          if (msg.op === "status") return { ok: true, status: { available: true, permission: "granted", version: 6 } };
          if (msg.op === "decks") return { ok: true, decks: ["Default", "Kinema", `Kinema::Courses::${course}`] };
          // Las mismas funciones que usa el service worker (background.ts → handleAnkiConnect).
          if (msg.op === "concepts") return { ok: true, notes: await ops.conceptNotes(invoke, msg.query) };
          if (msg.op === "reviewStates") return { ok: true, states: await ops.noteReviewStates(invoke, msg.noteIds) };
          if (msg.op === "reviewToday") return { ok: true, result: await ops.rescheduleToday(invoke, msg.noteIds) };
          if (msg.op === "knownWords") return { ok: true, words: [] };
          if (msg.op === "counts") return { ok: true, counts: msg.queries.map(() => 0) };
        } catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
        return { ok: false, error: `op ${msg.op}` };
      });
    }, COURSE);
    await reachFijar();
    const block = page.locator("[data-deck-dups]");
    assert.equal(await block.getAttribute("data-deck-source"), "anki", "con Anki conectado, el mazo real");
    assert((await block.innerText()).includes("comprobado en Anki"));
    const review = block.locator("[data-deck-review-today]");
    await review.waitFor({ timeout: 10000 });
    assert.equal(await review.innerText(), "Repasar hoy en Anki (1)", "solo la que está en repaso");
    await block.locator('[data-deck-dup="1"] [data-deck-dup-state="new"]').waitFor();
    assert.equal(await block.locator('[data-deck-dup="1"] [data-deck-dup-state]').innerText(), "En Anki aún es nueva: no tiene calendario que adelantar.", "la nueva dice por qué no se toca");
    assert.equal(await block.locator('[data-deck-dup="0"] [data-deck-dup-state]').innerText(), "En repaso en Anki: se puede adelantar a hoy.");
    const before = await page.evaluate(() => window.__anki.log.map((l) => l.action));
    assert(before.every((a) => ["findNotes", "notesInfo", "findCards"].includes(a)), `hasta pulsar, solo lectura: ${[...new Set(before)].join(", ")}`);
    assert.equal(await block.getByRole("button", { name: "Ver en Anki" }).count(), 2, "cada una se puede ver en Anki");
    await auditBothThemes("[data-deck-dups]", "fijar-anki");
    await review.click();
    await toast("1 tarjeta para hoy en Anki").waitFor();
    const after = await page.evaluate(() => window.__anki.log);
    const writes = after.filter((l) => !["findNotes", "notesInfo", "findCards"].includes(l.action));
    assert.deepEqual(writes, [{ action: "setDueDate", params: { cards: [10010], days: "0" } }], `un solo cambio, la tarjeta en repaso, con "0": ${JSON.stringify(writes)}`);
    const eligibility = after.filter((l) => l.action === "findCards").map((l) => l.params.query);
    assert(eligibility.includes('nid:1001 note:"Udemy Bridge Concept" is:review -is:learn -is:suspended -is:buried -is:due'), `la búsqueda de lo que se puede adelantar: ${eligibility.join(" | ")}`);
    const notes = await page.evaluate(() => window.__anki.notes);
    assert.equal(notes.find((n) => n.id === 1002).type, "new", "la nueva no se toca");
    assert.equal(notes.find((n) => n.id === 1002).due, false);
    await block.locator('[data-deck-dup="0"] [data-deck-dup-state="rescheduled"]').waitFor();
    assert.equal(await block.locator("[data-deck-review-today]").count(), 0, "ya no queda nada que adelantar");
    await page.waitForTimeout(300);
    const rec = await record();
    assert(rec?.studyContent?.deckMatches?.[0]?.rescheduledAt > 0 && !rec.studyContent.deckMatches[1].rescheduledAt, "el historial recuerda cuál se adelantó");
    assert.deepEqual(rec.studyContent.deckMatches.map((m) => [m.idea, m.source, m.noteId, m.course]), [[0, "anki", 1001, undefined], [1, "anki", 1002, undefined]], "las de este curso; la de otro curso con el mismo frente no decide");
    const asked = (await page.evaluate(() => window.__anki.log)).filter((l) => l.action === "findNotes").map((l) => l.params.query);
    assert(asked.some((q) => q.startsWith('note:"Udemy Bridge Concept" -tag:kinema::curso::')), `también lee los demás cursos (solo lectura): ${asked.join(" | ")}`);
    await page.locator(".usb-dock").screenshot({ path: shotPath("fijar-anki-hecho") }).catch(() => {});
  });
  console.log("PASS Con Anki: el mazo real (y los demás cursos, solo lectura: el mismo frente en otro curso no decide), el estado de cada tarjeta (la nueva dice por qué no se toca), solo lectura hasta pulsar, y «Repasar hoy en Anki (1)» cambia SOLO la tarjeta en repaso con setDueDate \"0\"");

  assert.deepEqual(pageErrors, [], "sin errores de ejecución");
  console.log("QA duplicados (fase 4): OK");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
