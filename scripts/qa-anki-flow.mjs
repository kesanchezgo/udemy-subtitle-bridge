// QA de la fase 2 (Anki) en el prototipo, con un Anki simulado (AnkiConnect
// falso inyectado en ankiBridge): mazo del curso a la vista, envío al terminar
// (fase 5: sin exportar), «Cambiar» moviendo lo ya importado, historial,
// registro, Ajustes, «Ordenar lo antiguo» y la Biblioteca (Programa → Curso →
// Lección con las cifras reales de Anki).
// node scripts/qa-anki-flow.mjs   ·   QA_DEBUG=1 para ver cada etapa.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const port = 4192;
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
    const shot = `/tmp/qa-anki-fail-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    await page?.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const text = await page?.evaluate(() => document.body.innerText.slice(0, 2000)).catch(() => "");
    console.error(`FAIL ${name} — captura: ${shot}\n--- texto visible ---\n${text}\n---`);
    if (pageErrors.length) console.error("--- errores de página ---\n" + pageErrors.slice(-3).join("\n"));
    throw error;
  }
}

// El Anki simulado vive en la página: ankiBridge le habla por setAnkiTransport.
const installFakeAnki = () => page.evaluate(async () => {
  const fake = { calls: [], imports: [], moves: [], migrations: [], counts: [], browses: [] };
  window.__fakeAnki = fake;
  const bridge = await import("/src/app/services/ankiBridge.ts");
  const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
  await chromeLocalStorage.set({ usb_anki_connected: true });
  bridge.setAnkiTransport(async (msg) => {
    fake.calls.push(msg.op);
    if (msg.op === "status") return { ok: true, status: { available: true, permission: "granted", version: 6 } };
    if (msg.op === "decks") return { ok: true, decks: ["Default", "English Cards", "Kinema", "Kinema::Courses", "Mis cursos::Java"] };
    if (msg.op === "import") { fake.imports.push({ size: msg.base64.length, countQuery: msg.countQuery, filename: msg.filename }); return { ok: true, result: { before: 0, after: 4, added: 4 } }; }
    if (msg.op === "move") { fake.moves.push({ query: msg.query, deck: msg.deck }); return { ok: true, moved: 4 }; }
    if (msg.op === "migrate") {
      fake.migrations.push({ dryRun: msg.dryRun, layout: msg.config?.conceptLayout });
      const moves = [
        { kind: "concepts", from: "Kinema::Courses::Java::L1", to: "Kinema::Courses::Java", cards: 3, moved: !msg.dryRun, removed: !msg.dryRun },
        { kind: "vocab", from: "Kinema::Vocabulary::English::Java", to: "Kinema::Vocabulary::English", cards: 2, moved: !msg.dryRun, removed: !msg.dryRun },
      ];
      const tags = [{ from: "kinema::track::data-analyst", to: "kinema::programa::data-analyst", notes: 4, renamed: !msg.dryRun }];
      return { ok: true, moves, tags };
    }
    if (msg.op === "addTag") { (fake.tagged ??= []).push({ query: msg.query, tag: msg.tag }); return { ok: true, tagged: 0 }; }
    if (msg.op === "knownWords") return { ok: true, words: [] };
    if (msg.op === "vocabDecks") {
      const isEn = (msg.langCode || "en") === "en";
      return {
        ok: true,
        inspection: {
          detectedKinemaDeck: null,
          defaultDeckExists: false,
          compatibleDecks: isEn ? [{ deck: "English Cards", reason: "compatible", noteType: "English Cards", cards: 42 }] : [],
        },
      };
    }
    // Biblioteca: cifras por búsqueda (según lo que pide cada una) y abrir el navegador de Anki.
    if (msg.op === "counts") {
      fake.counts.push(msg.queries);
      return { ok: true, counts: msg.queries.map((q) => (
        /^\(note:"Kinema · Vocab/.test(q) ? (/ is:due$/.test(q) ? 1 : 4)
          : / is:learn is:review$/.test(q) ? 1 : / is:learn -is:review$/.test(q) ? 2 : / is:new$/.test(q) ? 5
          : /-tag:kinema::leccion::/.test(q) ? 2
          : /tag:kinema::leccion::(functions|packages)/.test(q) ? 0
          : /tag:kinema::leccion::variables/.test(q) && window.__forceZero ? 0
          : / is:due$/.test(q) ? (/kinema::leccion::/.test(q) ? 1 : 3)
          : / tag:kinema::reforzar$/.test(q) ? 2 : / is:suspended$/.test(q) ? 1 : 12)) };
    }
    if (msg.op === "browse") { fake.browses.push(msg.query); return { ok: true }; }
    return { ok: false, error: `op ${msg.op}` };
  });
});
const fake = () => page.evaluate(() => window.__fakeAnki);
const record = () => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && /whatisjava/.test(k));
  return key ? JSON.parse(localStorage.getItem(key)) : null;
});

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
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.route("**/src/main.tsx", (route) => route.fulfill({ contentType: "application/javascript", body: 'import React from "/node_modules/.vite/deps/react.js"; import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js"; import App from "/src/app/App.tsx"; import "/src/styles/index.css"; ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));' }));
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ── 1. Llegar a Fijar con Anki «conectado» ──────────────────────────────
  await stage("llegar a Fijar", async () => {
    await installFakeAnki();
    // Antes de entrar (sin Study): Ajustes ya muestra Anki e Idiomas, no un «inicia sesión».
    await page.getByRole("button", { name: "Abrir configuración", exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "vocabulary" } })));
    const early = page.locator("[data-vocabulary-standalone]");
    await early.getByRole("radiogroup", { name: "Nivel mínimo de vocabulario" }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByText(/Inicia sesión o continúa sin cuenta/).count(), 0, "nunca una sección vacía con «inicia sesión»");
    await early.getByRole("radiogroup", { name: "Nivel mínimo de vocabulario" }).getByRole("radio", { name: "B2", exact: true }).click();
    await page.waitForFunction(async () => (await import("/src/app/services/vocabularyService.ts")).loadVocabConfig().then((c) => c.minLevel === "B2"), null, { timeout: 5000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "anki" } })));
    await page.locator("[data-anki-standalone] [data-anki-connection]").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).dispatchEvent("click");
    await page.getByText("Continuar sin cuenta", { exact: true }).click();
    await page.getByPlaceholder("Ej: Conseguir trabajo en fintech como Java dev en 3 meses…").fill("Entender cómo la JVM ejecuta Java");
    await page.getByRole("button", { name: /Generar sesión de aprendizaje|Empezar/ }).click();
    await page.getByRole("button", { name: /^Entendido/ }).click({ timeout: 30000 });
    await page.getByRole("button", { name: /^Ponerme a prueba/ }).click();
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    await page.getByRole("button", { name: "Continuar a Aplicar" }).click();
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    await page.locator("[data-anki-deck]").waitFor();
  });
  console.log("PASS Antes de entrar, Ajustes ya muestra Anki e Idiomas (la misma configuración que luego usa Study); Fijar alcanzado con Anki simulado");

  // ── 2. Destino a la vista y, al terminar, las tarjetas llegan solas ────
  const courseDeck = "Kinema::Courses::Java In-Depth: Become a Complete Java Engineer!";
  await stage("enviar a Anki", async () => {
    assert.equal(await page.locator("[data-anki-deck-name]").innerText(), courseDeck, "un mazo por curso, sin submazo de lección");
    assert((await page.locator("[data-anki-deck]").innerText()).includes("Mazo del curso"), "muestra el mazo del curso de forma limpia");
    // Fase 5: no hay exportación — ni «Enviar a Anki», ni «Descargar .apkg», ni «Exportar .apkg».
    const dock = page.locator(".usb-dock");
    assert.equal(await dock.getByRole("button", { name: /Descargar \.apkg|Exportar \.apkg|Enviar a Anki|Guía de importación/ }).count(), 0, "Fijar no tiene botones de exportar");
    const line = page.locator("[data-sync]").first();
    await page.locator('[data-sync="ready"]').first().waitFor();
    assert.match(await line.innerText(), /Al terminar la lección, sus \d+ tarjetas llegan solas a Anki/, `qué va a pasar, antes de terminar: ${await line.innerText()}`);
    assert.match(await page.locator("[data-finish-summary]").innerText(), /sin exportar nada: \d+ tarjetas y las palabras que marques van a Anki/);
    await page.locator("[data-anki-deck]").scrollIntoViewIfNeeded();
    await dock.screenshot({ path: "/tmp/kinema-anki-fijar.png" });
    assert.equal((await fake()).imports.length, 0, "nada sale antes de terminar");
    // Un aviso puede tapar el botón: el clic va directo a él.
    await page.getByRole("button", { name: /Terminar lección/ }).dispatchEvent("click");
    await page.locator("[data-sonner-toast]").filter({ hasText: "tarjetas nuevas en Anki" }).first().waitFor({ timeout: 30000 });
    await page.locator('[data-sync="sent"]').first().waitFor();
    assert.match(await page.locator('[data-sync="sent"]').first().innerText(), /4 tarjetas nuevas en Anki: lo confirmó Anki/);
    const f = await fake();
    assert.equal(f.imports.length, 1, "se importa un paquete, una vez");
    assert(f.imports[0].size > 1000, "el paquete .apkg viaja entero (el mismo de siempre)");
    assert(/tag:kinema::leccion::what-is-java-jvm/.test(f.imports[0].countQuery), `la confirmación cuenta las notas de ESTA lección: ${f.imports[0].countQuery}`);
    await page.waitForTimeout(500);
    const rec = await record();
    assert.equal(rec?.ankiDeck, courseDeck, "el historial guarda a qué mazo fue");
    assert(rec?.exportedAt, "cuenta como en Anki");
    assert.equal(rec?.syncPending, undefined, "nada esperando");
    assert(Array.isArray(rec?.exportedGuids) && rec.exportedGuids.length === 4, "los GUID de lo que está en Anki");
    const registry = await page.evaluate(async () => (await (await import("/src/app/services/ankiBridge.ts")).loadCourseDecks()));
    assert.equal(Object.values(registry)[0]?.deck, courseDeck, "el curso queda con su mazo (no se reparte después)");
    await page.waitForTimeout(1200);
    assert.equal((await fake()).imports.length, 1, "no se reenvía sin cambios");
    await dock.screenshot({ path: "/tmp/kinema-anki-fijar-sent.png" });
  });
  console.log("PASS Terminar lección: las tarjetas llegan solas a Anki (el mismo .apkg, confirmado con el recuento de la lección), sin botones de exportar; historial y registro con el mazo");

  // ── 3. «Cambiar»: otro mazo para todo el curso, moviendo lo importado ───
  await stage("cambiar mazo", async () => {
    const picker = page.locator("[data-anki-deck]");
    await picker.getByRole("button", { name: "Cambiar" }).click();
    await picker.getByRole("radio").nth(1).check();
    await picker.getByLabel("Nombre del mazo").fill("Mis cursos::Java");
    const moveBox = picker.getByRole("checkbox");
    await page.locator(".usb-dock").screenshot({ path: "/tmp/kinema-anki-cambiar.png" });
    assert(await moveBox.isChecked(), "mover lo ya importado viene marcado");
    await picker.getByRole("button", { name: "Usar este mazo" }).click();
    await page.locator("[data-sonner-toast]").filter({ hasText: "Mazo del curso actualizado" }).first().waitFor();
    const f = await fake();
    assert.equal(f.moves.length, 1);
    assert.equal(f.moves[0].deck, "Mis cursos::Java");
    assert(/tag:kinema::curso::java-in-depth-become-a-complete-java-engineer/.test(f.moves[0].query), `mueve las tarjetas del curso: ${f.moves[0].query}`);
    await page.locator("[data-anki-deck-name]").filter({ hasText: "Mis cursos::Java" }).waitFor();
    assert((await page.locator("[data-anki-deck]").innerText()).includes("Un mazo tuyo"), "un mazo del estudiante se dice como tal");
    // Volver al de Kinema desde el mismo control.
    await picker.getByRole("button", { name: "Cambiar" }).click();
    await picker.getByRole("radio").first().check();
    await picker.getByRole("button", { name: "Usar este mazo" }).click();
    await page.locator("[data-anki-deck-name]").filter({ hasText: courseDeck }).waitFor();
  });
  console.log("PASS Cambiar: el mazo de todo el curso (registro único), moviendo lo importado con sus repasos, y vuelta al de Kinema");

  // ── 4. Ajustes: conexión, mazos fijos, etiquetas y «Ordenar lo antiguo» ──
  await stage("ajustes", async () => {
    // Ajustes → Anki: todo lo que decide dónde quedan las tarjetas, en un sitio.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "anki" } })));
    const anki = page.locator("[data-anki-preferences]");
    const conn = page.locator("[data-anki-connection]");
    await conn.waitFor({ timeout: 10000 });
    const connText = await conn.innerText();
    assert(/AnkiConnect · v6/.test(connText) && /Conectado · 5 mazos · envío automático/.test(connText), `estado de la conexión: ${connText}`);
    assert.equal(await anki.locator("[data-status-pill]").first().innerText(), "Conectado", "la misma píldora que IA y Obsidian");
    assert.equal(await anki.locator("[data-anki-standalone]").count(), 0, "con Study, Anki es el de Study (no la copia de antes de entrar)");
    // Un solo nivel, como el resto de Ajustes: grupos, filas y texto (nada de tarjetas dentro).
    assert.deepEqual((await anki.locator("h4").allInnerTexts()).map((g) => g.toLowerCase()), ["conexión", "mazos", "mantenimiento"]);
    assert.match(await page.locator("[data-anki-courses]").innerText(), /Kinema::Courses::‹curso›/);
    assert.match(await page.locator("[data-anki-vocab]").innerText(), /Vocabulario · Inglés[\s\S]*Kinema::Vocabulary::English/);
    assert.match(await page.locator("[data-anki-paths]").innerText(), /Plantilla y ritmo propios[\s\S]*sin tocar tus otros tipos de nota ni duplicar/, "explica plantilla, ritmo y control de duplicados");
    assert.equal(await anki.getByText("Siempre", { exact: true }).count(), 0, "los cursos se explican, no son un ajuste «Siempre»");
    assert.equal(await anki.getByRole("button", { name: "Organización de los mazos de cursos" }).count(), 0, "sin «Organización»: siempre un mazo por curso");
    // Palabras: SOLO ofrece El de Kinema y mazos con diseño compatible (excluye Default y Mis cursos::Java).
    const words = anki.getByRole("button", { name: "Mazo de las palabras" });
    assert.equal(await words.count(), 1, "el mazo de las palabras vive en Anki");
    assert.equal((await words.innerText()).trim(), "El de Kinema");
    await words.click();
    const offered = await anki.getByRole("listbox", { name: "Mazo de las palabras" }).getByRole("option").allInnerTexts();
    assert.deepEqual(offered.map((t) => t.split("\n")[0].trim()), ["El de Kinema", "English Cards"], `solo el de Kinema y mazos compatibles (sin Default ni Mis cursos::Java): ${offered}`);
    await anki.getByRole("option", { name: /^English Cards/ }).dispatchEvent("click");
    await page.waitForFunction(async () => (await import("/src/app/services/vocabularyService.ts")).loadVocabConfig().then((c) => c.vocabDecks?.English === "English Cards"), null, { timeout: 5000 });
    assert.equal(await anki.locator("[data-vocab-deck-path]").innerText(), "English Cards", "se ve el mazo elegido");
    assert.match(await page.locator("[data-anki-vocab]").innerText(), /conserva sus opciones/, "un mazo tuyo conserva su ritmo");
    await words.click();
    await anki.getByRole("option", { name: /^El de Kinema/ }).dispatchEvent("click");
    await page.waitForFunction(async () => (await import("/src/app/services/vocabularyService.ts")).loadVocabConfig().then((c) => c.vocabDecks?.English === ""), null, { timeout: 5000 });
    assert.equal(await anki.locator("[data-vocab-deck-path]").innerText(), "Kinema::Vocabulary::English", "de vuelta al de Kinema");
    // Idiomas: solo qué palabras se proponen (nada de mazos ni de conexión).
    const vocab = page.locator("[data-vocabulary-preferences]");
    const vocabPrefs = await vocab.evaluate((el) => el.textContent ?? "");
    assert(!/Organización|AnkiConnect|Tarjetas de la lección|Tarjetas por palabra|Programas|Uno por idioma|Uno que ya tienes/.test(vocabPrefs), `Idiomas solo trae lo de las palabras, sin Tarjetas por palabra: ${vocabPrefs.slice(0, 300)}`);
    assert.equal(await vocab.getByLabel("Mazo raíz de Anki").count(), 0, "el mazo raíz se ajusta en Anki");
    assert.equal(await vocab.getByRole("button", { name: "Mazo de las palabras" }).count(), 0, "el mazo de las palabras, en Anki");
    assert.equal(await vocab.locator("[data-vocab-anki-link]").count(), 1, "Idiomas enlaza a Anki para el mazo");
    assert.equal(await anki.getByLabel("Mazo raíz de Anki").count(), 1);
    // Sincronización automática con el mazo conectado (sin selector extra de «otros mazos»): Anki cuenta las palabras directamente.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "vocabulary" } })));
    await page.waitForTimeout(400);
    assert.equal(await vocab.getByRole("button", { name: "Añadir un mazo con palabras que ya sabes" }).count(), 0, "solo usa el mazo de vocabulario conectado automáticamente");
    await vocab.locator("[data-vocab-known-count]").waitFor({ timeout: 5000 });
    assert((await fake()).calls.includes("knownWords"), "las palabras se cuentan en Anki, no se adivinan");
    assert.equal(await vocab.getByRole("radiogroup", { name: "Tarjetas por palabra" }).count(), 0, "una sola tarjeta completa por palabra: sin selector de 2 tarjetas");
    assert.equal(await vocab.getByRole("radiogroup", { name: "Nivel mínimo de vocabulario" }).getByRole("radio", { name: "B2", exact: true }).getAttribute("aria-checked"), "true", "lo cambiado antes de entrar es lo que Study usa");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "anki" } })));
    await page.waitForTimeout(400);
    const sections = await page.locator(".kx-settings-section").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    assert.deepEqual(sections, ["Proveedor de IA", "Anki", "Idiomas", "Obsidian", "Caché"], `Ajustes por herramienta: ${sections}`);
    const sheet = await page.getByRole("dialog").filter({ hasText: "Configuración" }).first().evaluate((el) => el.textContent ?? "").catch(() => anki.evaluate((el) => el.closest("[role]")?.textContent ?? ""));
    assert(!/DataCamp|Udemy/.test(sheet), "Ajustes no nombra ninguna plataforma");
    for (const sel of ["[data-anki-preferences]", "[data-vocabulary-preferences]"]) assert(!/DataCamp|Udemy|Coursera/.test(await page.locator(sel).evaluate((el) => el.textContent ?? "")), `${sel}: sin nombres de plataforma`);
    const tidy = page.locator("[data-anki-migration]");
    await tidy.getByRole("button", { name: "Revisar mazos y etiquetas antiguos" }).dispatchEvent("click");
    await tidy.getByText("2 mazos antiguos · 5 tarjetas", { exact: false }).waitFor();
    assert.match(await tidy.innerText(), /4 notas con 1 etiqueta antigua pasarán a kinema::programa \/ kinema::plataforma/);
    await tidy.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/kinema-anki-ajustes.png" });
    assert.equal((await fake()).migrations.at(-1).dryRun, true, "revisar solo cuenta (no mueve)");
    await tidy.getByRole("button", { name: "Ordenar ahora" }).dispatchEvent("click");
    await page.locator("[data-sonner-toast]").filter({ hasText: "Anki, ordenado" }).first().waitFor();
    assert.match(await page.locator("[data-sonner-toast]").filter({ hasText: "Anki, ordenado" }).first().innerText(), /5 tarjetas en su mazo de curso o de idioma.*4 notas con las etiquetas de ahora.*Comprobar base de datos/s);
    assert.equal((await fake()).migrations.at(-1).dryRun, false, "ordenar se hace solo al confirmar");
  });
  console.log("PASS Ajustes: IA · Anki · Idiomas · Obsidian · Caché, en un solo nivel; Anki con conexión, dónde quedan las tarjetas (diseño + ritmo), el mazo de las palabras por idioma en un menú con tus mazos reales y las etiquetas plegadas; «Lo que ya sabes» desde tus mazos, contado en Anki; Idiomas solo con lo de las palabras, sin nombres de plataforma; «Ordenar lo antiguo» cuenta y solo cambia al confirmar (mazos y etiquetas)");

  // ── 5. Biblioteca: Programa → Curso → Lección, con el mazo y las cifras reales ──
  const pyCourse = "Introduction to Python";
  await stage("biblioteca", async () => {
    await page.evaluate(async () => {
      const now = Date.now();
      const base = { courseId: "intro-python", courseName: "Introduction to Python", questions: [], status: "completed" };
      const recs = [
        { ...base, lectureId: "variables", lectureName: "Variables", startedAt: now - 5000, updatedAt: now - 5000, finishedAt: now - 4000, exportedAt: now - 4000, ankiDeck: "Kinema::Courses::Introduction to Python", dcTrackSlug: "data-scientist-in-python", ankiCardsCount: 3, obsidianExportedAt: now - 3900,
          ankiCards: [
            { id: "p1", front: "¿Qué es una variable?", back: "Un nombre para un valor.", type: "concepto", reinforce: true },
            { id: "p2", front: "Explica el tipado dinámico", back: "El tipo va con el valor.", type: "entrevista" },
            { id: "p3", front: "¿Mutable o inmutable?", back: "Depende del tipo.", type: "concepto", doubt: true },
          ] },
        // En curso, con una respuesta (una lección abierta sin hacer nada no se lista).
        { ...base, lectureId: "functions", lectureName: "Functions", startedAt: now - 3000, updatedAt: now - 3000, status: "in_progress", dcTrackSlug: "data-scientist-in-python", ankiCardsCount: 0,
          questions: [{ id: "q1", question: "¿Qué devuelve una función sin return?", answer: "None" }] },
        { ...base, lectureId: "packages", lectureName: "Packages", startedAt: now - 2000, updatedAt: now - 2000, finishedAt: now - 1500, dcTrackSlug: "python-programming", ankiCardsCount: 1,
          ankiCards: [{ id: "p4", front: "¿Qué es pip?", back: "El gestor de paquetes.", type: "concepto" }] },
      ];
      for (const r of recs) localStorage.setItem(`usb_history_lecture::${r.courseId}::${r.lectureId}`, JSON.stringify(r));
      const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
      const { DEFAULT_OBSIDIAN_EXPORT_CONFIG } = await import("/src/app/services/obsidianExport.ts");
      const { courseTotalKey } = await import("/src/app/services/courseTotals.ts");
      await chromeLocalStorage.set({
        // El content script lo guarda al abrir el curso (aquí, como DataCamp: 11 vídeos).
        usb_course_totals: { [courseTotalKey("Introduction to Python")]: { total: 11, source: "datacamp", slug: "intro-to-python-for-data-science", at: now } },
        usb_dc_program_titles: { "data-scientist-in-python": "Data Scientist in Python" },
        obsidian_export_config: { ...DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: "Mi Vault" },
      });
      // Las URIs obsidian:// se recogen en vez de lanzar la app.
      window.__obsidian = [];
      document.addEventListener("click", (e) => {
        const a = e.target instanceof Element ? e.target.closest("a") : null;
        if (a && a.href.startsWith("obsidian:")) { window.__obsidian.push(a.href); e.preventDefault(); }
      }, true);
    });
    const before = (await fake()).calls.length;
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).click();
    await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
    const list = page.getByRole("region", { name: "Cursos estudiados" });
    await list.waitFor();

    // Programa → Curso: el curso de dos programas aparece UNA vez, bajo el principal.
    const groups = await page.locator("[data-library-group]").evaluateAll((els) => els.map((el) => [el.getAttribute("data-library-group"), (el.querySelector("p")?.innerText ?? "").replace(/\s+/g, " ")]));
    assert.deepEqual(groups.map((g) => g[0]), ["data-scientist-in-python", "none"], `programas primero, el resto al final: ${JSON.stringify(groups)}`);
    assert(/Programa · Data Scientist in Python/.test(groups[0][1]) && /Otros cursos/.test(groups[1][1]), `títulos de los grupos: ${JSON.stringify(groups)}`);
    const pyRows = list.locator("button[aria-expanded]").filter({ hasText: pyCourse });
    assert.equal(await pyRows.count(), 1, "un curso en varios programas no se duplica");
    await pyRows.filter({ hasText: "12 en Anki" }).waitFor();
    assert.match(await pyRows.innerText(), /2 de 11 lecciones · 1 en curso · 12 en Anki/, "con temario: lecciones del CURSO y recuento en vivo de Anki");
    assert.equal(await pyRows.locator("[data-course-pct]").innerText(), "18%", "y su porcentaje del curso en el anillo");
    const javaRowEarly = list.locator("[data-library-group=none] button[aria-expanded]").filter({ hasText: "Java In-Depth" });
    assert.match(await javaRowEarly.innerText(), /\d+ terminadas? de \d+ empezadas?/, "sin temario: terminadas de empezadas, sin porcentaje");
    assert.match(await javaRowEarly.locator("[data-course-pct]").innerText(), /^\d+\/\d+$/, "y en el anillo una fracción, no un %");

    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = "hidden"; }));
    await list.scrollIntoViewIfNeeded();
    await list.screenshot({ path: "/tmp/kinema-biblioteca-lista.png" }).catch(() => {});
    await page.evaluate(() => document.querySelectorAll("[data-sonner-toaster]").forEach((el) => { el.style.visibility = ""; }));
    // Curso: mazo único, programas, cifras del historial y de Anki.
    await pyRows.click();
    const py = page.locator('[data-library-course="intro-python"]');
    await py.waitFor();
    assert.equal(await py.locator("[data-anki-deck-name]").innerText(), "Kinema::Courses::Introduction to Python", "el mazo del curso, el mismo que usaría Fijar");
    assert.match(await py.locator("[data-library-programs]").innerText(), /Programa: Data Scientist in Python · también en Python Programming/);
    await py.locator("[data-anki-count=cards]").waitFor();
    assert.equal(await py.locator("[data-library-history-stats]").count(), 0, "con Anki conectado no se apila la fila estática del historial");
    assert.match(await py.locator("[data-library-anki-counts]").innerText(), /En tu Anki/, "un único panel en vivo");
    await py.locator("[data-library-course-vocab]").filter({ hasText: "Vocabulario (4)" }).waitFor();
    const cells = await py.locator("[data-anki-count]").evaluateAll((els) => Object.fromEntries(els.map((el) => [el.getAttribute("data-anki-count"), el.querySelector("dd")?.innerText])));
    assert.deepEqual(cells, { cards: "12", fresh: "5", learning: "2", relearning: "1", due: "3" }, "total, nuevas, aprendiendo, reaprendiendo y para hoy, de Anki");
    const asked = (await fake()).counts.at(-1);
    assert(asked.length >= 15 && asked.some((q) => q.includes("tag:kinema::duda")), "consulta de dudas, untracked y tarjetas por lección");
    assert(asked.every((q) => q.includes('-note:"Kinema · Vocab · *" -note:"Udemy Bridge Vocab"')), "solo conceptos: el vocabulario no cuenta");
    assert.equal(await py.locator("[data-anki-suspended]").innerText(), " · 1 suspendida", "las suspendidas se dicen aparte");
    assert.match(await py.locator("[data-library-anki-counts]").innerText(), /2 de refuerzo · 12 de dudas/, "refuerzo y dudas vienen de Anki");
    assert.match(await py.locator("[data-anki-untracked]").innerText(), /tarjetas en el mazo no corresponden a estas lecciones/, "aviso de tarjetas sin lección listada");
    assert(asked.length >= 16 && asked.some((q) => q.includes("tag:kinema::duda")), "consulta de dudas y de tarjetas por lección");
    assert(asked[0].includes("tag:kinema::curso::introduction-to-python"), `por etiqueta del curso: ${asked[0]}`);
    assert.equal(await py.locator("[data-library-badges]").filter({ hasText: "1 para hoy" }).count(), 1, "pendientes por lección (la exportada)");

    // Abrir en Anki / Repasar hoy: solo el navegador de Anki.
    await py.getByRole("button", { name: "Abrir en Anki" }).click();
    await py.getByRole("button", { name: "Repasar hoy (3)" }).click();
    await page.waitForTimeout(200);
    const browses = (await fake()).browses;
    assert.equal(browses.length, 2);
    assert(browses[0] === asked[0] && browses[1] === `${asked[0]} is:due`, `abre las tarjetas del curso y sus pendientes: ${JSON.stringify(browses)}`);

    // Filtros por lección.
    assert.deepEqual(await py.getByRole("button", { pressed: false }).filter({ hasText: /^(Refuerzo|Dudas|Entrevista|Sin enviar) \d+$/ }).allInnerTexts(), ["Refuerzo 1", "Dudas 1", "Entrevista 1", "Sin enviar 1"]);
    await py.getByRole("button", { name: "Dudas 1" }).click();
    assert.deepEqual(await py.locator("[data-library-lesson]").evaluateAll((els) => els.map((el) => el.getAttribute("data-library-lesson"))), ["variables"], "Dudas: solo la lección con dudas");
    await py.getByRole("button", { name: "Sin enviar 1" }).click();
    assert.deepEqual(await py.locator("[data-library-lesson]").evaluateAll((els) => els.map((el) => el.getAttribute("data-library-lesson"))), ["packages"], "Sin enviar: terminada y aún no en Anki");
    // Terminada antes de la fase 5 y sin enviar: no se envía sola; con Anki conectado, un clic.
    assert.equal(await py.locator('[data-library-send="packages"]').innerText(), "Enviar 1");
    await py.getByRole("button", { name: "Todas 3" }).click();

    assert.equal(await py.locator('[role="button"] button, button button').count(), 0, "sin botones dentro de botones (abrir la lección es un botón aparte)");
    assert.equal(await py.getByRole("button", { name: /^Variables Terminada/ }).count(), 1, "abrir la lección: nombre propio, sin las acciones de la fila");
    // Lección: etiquetas, «Ver en Anki» y nota de Obsidian.
    await py.getByRole("button", { name: "Detalle de Variables" }).click();
    const detail = py.locator("[data-library-lesson=variables] [data-library-lesson-detail]");
    assert.deepEqual(await detail.locator("[data-library-tag]").allInnerTexts(), ["kinema::curso::introduction-to-python", "kinema::leccion::variables", "kinema::programa::data-scientist-in-python"], "las etiquetas con las que se encuentran sus tarjetas (fase 5: kinema::programa)");
    await detail.getByRole("button", { name: "Ver en Anki" }).click();
    await detail.getByRole("button", { name: "Abrir nota" }).click();
    await py.getByRole("button", { name: "Abrir índice" }).click();
    await page.waitForTimeout(200);
    assert(/tag:kinema::leccion::variables/.test((await fake()).browses.at(-1)), "Ver en Anki: las tarjetas de la lección");
    const uris = await page.evaluate(() => window.__obsidian);
    assert.equal(uris.length, 2);
    assert(uris[0].startsWith("obsidian://open?vault=Mi%20Vault&file=") && !uris[0].endsWith(".md") && /introduction-to-python---variables$/i.test(decodeURIComponent(uris[0])), `nota de la lección: ${uris[0]}`);
    assert(/introduction-to-python$/i.test(decodeURIComponent(uris[1])), `índice del curso: ${uris[1]}`);
    assert.match(await py.locator("[data-library-obsidian]").innerText(), /1 de 3 lecciones en Obsidian/);
    // Una lección exportada que ya no tiene tarjetas en Anki: aviso ámbar con reenvío.
    await page.evaluate(() => { window.__forceZero = true; });
    await py.getByRole("button", { name: "Actualizar las cifras de Anki" }).click();
    await py.locator('[data-anki-lesson-missing="variables"]').waitFor();
    assert.match(await py.locator('[data-anki-lesson-missing="variables"]').innerText(), /^0 en Anki · Reenviar 3$/);
    await page.evaluate(() => { window.__forceZero = false; });
    await py.getByRole("button", { name: "Actualizar las cifras de Anki" }).click();
    await page.locator(".usb-dock").screenshot({ path: "/tmp/kinema-biblioteca.png" }).catch(() => {});

    // Hasta aquí, la Biblioteca solo ha leído.
    const ops = (await fake()).calls.slice(before);
    assert(ops.every((op) => ["status", "decks", "counts", "browse"].includes(op)), `solo lectura: ${[...new Set(ops)].join(", ")}`);

    // Cambiar el mazo del curso desde la Biblioteca: el mismo control y registro que Fijar.
    const picker = py.locator("[data-anki-deck]");
    await picker.getByRole("button", { name: "Cambiar" }).click();
    await picker.getByRole("radio").nth(1).check();
    await picker.getByLabel("Nombre del mazo").fill("Mis cursos::Python");
    await picker.getByRole("button", { name: "Usar este mazo" }).click();
    await page.locator("[data-sonner-toast]").filter({ hasText: "Mazo del curso actualizado" }).last().waitFor();
    const moved = (await fake()).moves.at(-1);
    assert.equal(moved.deck, "Mis cursos::Python");
    assert(/tag:kinema::curso::introduction-to-python/.test(moved.query), `mueve las tarjetas de ESE curso: ${moved.query}`);
    await py.locator("[data-anki-deck-name]").filter({ hasText: "Mis cursos::Python" }).waitFor();
    const registry = await page.evaluate(async () => (await (await import("/src/app/services/ankiBridge.ts")).loadCourseDecks()));
    const entries = Object.values(registry);
    assert.deepEqual(entries.map((e) => e.deck).sort(), ["Kinema::Courses::Java In-Depth: Become a Complete Java Engineer!", "Mis cursos::Python"], "un mazo por curso; Java no cambia");
    assert(entries.some((e) => e.deck === "Mis cursos::Python" && e.program === "Data Scientist in Python"), "el registro guarda el programa principal");
    assert(!(await fake()).counts.at(-1)[0].includes('deck:"Mis cursos::Python"'), "un mazo del estudiante no se cuenta entero");

    // Java: en «Otros cursos», con su mazo de Kinema y su lección exportada.
    const javaRow = list.locator("[data-library-group=none] button[aria-expanded]").filter({ hasText: "Java In-Depth" });
    await javaRow.click();
    const javaDetail = page.locator("[data-library-course]").filter({ has: page.locator("[data-anki-deck-name]", { hasText: courseDeck }) });
    await javaDetail.waitFor();
    assert.equal(await javaDetail.locator("[data-library-programs]").count(), 0, "un curso de Udemy no se inventa programa");
    await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).click();
    await list.waitFor({ state: "detached" });
  });
  console.log("PASS Biblioteca: Programa → Curso → Lección, curso de dos programas sin duplicar, mazo único (y cambio con registro), cifras del historial y de Anki (nuevas/aprendiendo/reaprendiendo/hoy, sin vocabulario), filtros, etiquetas, Anki y Obsidian solo de lectura");

  assert.deepEqual(pageErrors, [], "sin errores de ejecución");
  console.log("QA Anki (fase 2): OK");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
