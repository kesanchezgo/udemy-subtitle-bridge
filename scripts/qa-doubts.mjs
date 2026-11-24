// QA de las dudas sobre la lección (Study §5) en el prototipo local.
// node scripts/qa-doubts.mjs  ·  QA_DEBUG=1 para ver cada etapa.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
import JSZip from "jszip";
import initSqlJs from "sql.js";

const port = 4188;
const url = `http://127.0.0.1:${port}`;
const debug = (...args) => { if (process.env.QA_DEBUG) console.log("·", ...args); };
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "pipe" });
let browser;
let page;

// Cada etapa deja captura y volcado si falla: el error dice DÓNDE y QUÉ se veía.
let shotIndex = 0;
async function stage(name, fn) {
  debug(name);
  try {
    const result = await fn();
    // QA_SHOTS=dir: captura al final de cada etapa, para revisar el diseño a ojo.
    if (process.env.QA_SHOTS) await page?.screenshot({ path: `${process.env.QA_SHOTS}/${String(++shotIndex).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`, fullPage: true }).catch(() => {});
    return result;
  } catch (error) {
    const shot = `/tmp/qa-doubts-fail-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    await page?.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const text = await page?.evaluate(() => document.body.innerText.slice(0, 2500)).catch(() => "");
    console.error(`FAIL ${name} — captura: ${shot}\n--- texto visible ---\n${text}\n---`);
    if (typeof pageErrors !== "undefined" && pageErrors.length) console.error("--- errores de página ---\n" + pageErrors.slice(-3).join("\n"));
    if (typeof consoleErrors !== "undefined" && consoleErrors.length) console.error("--- consola ---\n" + consoleErrors.slice(-4).map((t) => t.slice(0, 900)).join("\n"));
    throw error;
  }
}

// Un aviso de sonner entra desde translateY(100%) con opacidad 0 y sale igual
// (data-mounted / data-removed): medido a mitad queda una altura por debajo del
// panel aunque el usuario lo vea bien. Se espera a que esté montado, sin salir,
// opaco y quieto (3 lecturas iguales seguidas), como mucho 4 s, sin tocar el
// ratón. Mismo criterio que scripts/qa-full-flows.mjs del repo.
function settleToast(match) {
  return page.evaluate(async (m) => {
    const find = () => [...document.querySelectorAll("[data-sonner-toast]")].find((el) =>
      el.dataset.removed !== "true"
      && (m.selector ? Boolean(el.querySelector(m.selector)) : (el.textContent ?? "").includes(m.text)));
    const read = () => {
      const el = find();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { mounted: el.dataset.mounted === "true", opacity: getComputedStyle(el).opacity, t: Math.round(r.top * 2) / 2, l: Math.round(r.left * 2) / 2 };
    };
    const deadline = performance.now() + 4000;
    let last = null;
    let same = 0;
    let now = null;
    while (performance.now() < deadline) {
      now = read();
      const ready = Boolean(now && now.mounted && now.opacity === "1");
      same = ready && last && now.t === last.t && now.l === last.l ? same + 1 : 0;
      if (same >= 2) return { ok: true, ...now };
      last = now;
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, found: Boolean(now), ...(now ?? {}) };
  }, match);
}

// Un aviso encima de un botón intercepta el clic y, como Playwright pone el
// ratón sobre él para pulsar, sonner pausa su temporizador: el aviso ya no se
// va y el clic agota sus 30 s. Se aparta el ratón y se espera a que ningún aviso
// visible tape el botón (lo que hace quien espera a que se vayan los avisos).
async function waitNoToastOver(locator, ms = 15000) {
  await page.mouse.move(1, 1);
  const button = await locator.elementHandle();
  await page.waitForFunction((btn) => {
    const b = btn.getBoundingClientRect();
    return [...document.querySelectorAll("[data-sonner-toast]")].every((t) => {
      if (t.dataset.removed === "true" || getComputedStyle(t).opacity === "0") return true;
      const r = t.getBoundingClientRect();
      return r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom;
    });
  }, button, { timeout: ms });
}

// Contraste WCAG con la pila REAL de fondos: se pinta en un canvas cada fondo
// de los ancestros (semitransparentes incluidos) y encima el color del texto;
// así también se resuelven los colores oklch de Tailwind v4. No cuenta lo
// deshabilitado, lo aria-hidden ni lo sr-only.
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

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(ready, "Vite did not start");
  await fetch(`${url}/src/main.tsx`).catch(() => {});
  let depsReady = false;
  for (let attempt = 0; attempt < 600 && !depsReady; attempt++) {
    const checks = await Promise.all(["react.js", "react-dom_client.js"].map(file => fetch(`${url}/node_modules/.vite/deps/${file}`).then(res => res.ok, () => false)));
    depsReady = checks.every(Boolean);
    if (!depsReady) await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(depsReady, "Vite optimized deps not ready");
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await page.route("**/src/main.tsx", route => route.fulfill({ contentType: "application/javascript", body: 'import React from "/node_modules/.vite/deps/react.js"; import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js"; import App from "/src/app/App.tsx"; import "/src/styles/index.css"; ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));' }));
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

  // ── 1. Servicio puro ─────────────────────────────────────────────────────
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const service = await stage("servicio", () => page.evaluate(async () => {
    const s = await import("/src/app/services/lessonDoubts.ts");
    const demo = (await import("/src/app/services/prototypeData.ts")).prototypeDoubtDemo();
    const o = await import("/src/app/services/obsidianExport.ts");
    const transcript = "Java is compiled to bytecode. The JVM reads the bytecode and executes it on the actual machine. Every operating system has its own JVM.";
    const parsed = s.parseDoubtAnswer([
      "La **JVM** ejecuta el bytecode.",
      "CITA: «the jvm reads the BYTECODE, and executes it on the actual machine»",
      "CITA: «La JVM traduce Java a Python en tiempo real»",
      "CITA: «the JVM»",
      "TARJETA: ¿Qué ejecuta la JVM? || El bytecode compilado por javac.",
    ].join("\n"), transcript);
    const outside = s.parseDoubtAnswer("FUERA DE LA LECCIÓN: esto no se cubre.\nCITA: «Every operating system has its own JVM.»\nTARJETA: ¿X? || Y", transcript);
    const streaming = [
      s.visibleDoubtText("FUERA DE LA"),
      s.visibleDoubtText("La JVM ejecuta.\nCI"),
      s.visibleDoubtText("La JVM ejecuta.\nCITA: «The JVM reads»"),
      s.visibleDoubtText("FUERA DE LA LECCIÓN: no se cubre"),
    ];
    const html = s.doubtCardHtml({ front: "¿Qué hace `<T>` en **genéricos**?", back: "Usa <b>tipos</b> & \"más\"", quote: "a < b" });
    const card = (n, front) => ({ q: "q", answer: "a", quotes: ["x", "y", "z"], outside: false, card: { front, back: "Reverso" }, source: "ai", at: n, saved: { front, back: "Reverso" } });
    const restored = s.sanitizeStoredDoubts([
      { id: "t1", kind: "question", anchor: "P1", updatedAt: 1, turns: [card(1, "Frente uno")] },
      { id: "t2", kind: "question", anchor: "P2", updatedAt: 2, turns: [card(2, "¡Frente UNO!")] },
      { id: "t3", kind: "concepts", anchor: "P3", updatedAt: 3, turns: [card(3, "Frente dos")] },
      { id: "t4", kind: "practice", anchor: "P4", updatedAt: 4, turns: [card(4, "Frente tres")] },
      { id: "bad", kind: "moment", anchor: "x", turns: [card(5, "Frente cinco")] },
    ]);
    const demoChecks = ["¿Cuándo actúa el JIT?", "¿Y quién libera la memoria?", "¿Qué diferencia hay entre el JDK y el JRE?", "¿Por qué el bytecode es portable?", "¿Qué hace exactamente la máquina virtual?"].map((q) => {
      const raw = demo.answerFor(q);
      const rawQuotes = raw.split("\n").filter((line) => /^CITA:/.test(line)).length;
      const p = s.parseDoubtAnswer(raw, demo.transcript);
      return { q, rawQuotes, verified: p.quotes.length, front: p.card?.front ?? "", outside: p.outside };
    });
    const demoOutside = s.parseDoubtAnswer(demo.answerFor("¿Esto vale igual en Kotlin?"), demo.transcript);
    const local = s.localDoubtAnswer("¿Qué hace la JVM con el bytecode?", { course: "c", lesson: "l", kind: "concepts", anchor: "" }, demo.transcript);
    const localMiss = s.localDoubtAnswer("¿Qué es un monad?", { course: "c", lesson: "l", kind: "concepts", anchor: "" }, demo.transcript);
    const thread = s.appendDoubtTurn(null, { course: "c", lesson: "l", kind: "concepts", anchor: "La JVM ejecuta bytecode" }, { q: "q", answer: "a", quotes: [], outside: false, card: null, source: "local", at: 1 });
    const upserted = s.upsertDoubtThread([{ ...thread, id: "a" }, { ...thread, id: "b" }, { ...thread, id: "c" }], { ...thread, id: "b", anchor: "cambiado" }).map((t) => `${t.id}:${t.anchor}`);
    const prompt = s.buildDoubtMessages({ course: "Java", lesson: "JVM", kind: "concepts", anchor: "La JVM ejecuta bytecode", keyConcepts: ["La JVM ejecuta bytecode", "El JIT compila el código caliente"] }, { text: "transcripción" }, [], "¿Qué es?")[1].content;
    const noteCard = s.doubtCardHtml({ front: "¿Qué hace `List<T>` en Java?", back: "Declara un **genérico** & tipado", quote: "The JVM reads the bytecode" });
    const note = o.buildSessionNoteMarkdown({
      courseName: "Java", lessonName: "JVM",
      doubts: [{ q: "¿Qué hace\nla JVM?", answer: "Ejecuta el bytecode.", quotes: ["The JVM reads the bytecode"], outside: false }, { q: "¿Kotlin?", answer: "No se cubre.", quotes: [], outside: true }],
      result: { title: "Lección completada", remembered: { count: 1, total: 3 }, check: { firstTry: 1, improved: 0, skipped: false }, practice: "done", cards: { total: 4, reinforce: 1, destination: "anki", doubt: 2 } },
      content: { relevance: { score: 1, reason: "" }, keyConcepts: ["JVM"], quickWin: "", questions: [], application: { isCode: false, setup: "", challenge: "", solution: "" }, interviewQ: null, nextAction: "", ankiCards: [{ front: noteCard.front, back: noteCard.back, type: "concepto" }] },
    }, o.DEFAULT_OBSIDIAN_EXPORT_CONFIG);
    const threaded = s.buildDoubtMessages(
      { course: "Java", lesson: "JVM", kind: "concepts", anchor: "La JVM ejecuta bytecode" },
      { text: transcript },
      [{ q: "¿Por qué compila?", answer: "Porque javac genera bytecode." }],
      "dame un ejemplo y qué es bytecode",
    )[1].content;
    const order = {
      transcript: threaded.indexOf("Transcripción de la lección"),
      history: threaded.indexOf("Conversación previa sobre esta duda"),
      question: threaded.indexOf("Duda del estudiante:"),
    };
    const outsideCard = s.parseDoubtAnswer(
      "FUERA DE LA LECCIÓN: explicación técnica.\nTARJETA: ¿Qué es el bytecode en CPython? || **Instrucciones intermedias** que compila Python antes de ejecutarlas. El intérprete las recorre una a una.",
      transcript,
    );
    const twoSentenceHtml = s.doubtCardHtml({
      front: "¿Qué hace javac?", back: "Compila a bytecode. El intérprete lo ejecuta después.", quote: "",
    });
    return {
      parsed, outside, streaming, html, demoChecks, demoOutside, local, localMiss, upserted, prompt, note,
      order, outsideCard, twoSentenceHtml,
      exportsList: Object.keys(s),
      restored: restored.map((t) => ({ id: t.id, saved: t.turns.filter((x) => x.saved).length, quotes: t.turns[0].quotes.length })),
      // Lección densa (6+ ideas): una 3.ª tarjeta de duda; al restaurar se respeta su tope.
      limits: [s.doubtCardLimit(3), s.doubtCardLimit(5), s.doubtCardLimit(6), s.doubtCardLimit(7)],
      restoredDense: s.sanitizeStoredDoubts([
        { id: "d1", kind: "question", anchor: "P1", updatedAt: 1, turns: [card(1, "Uno")] },
        { id: "d2", kind: "question", anchor: "P2", updatedAt: 2, turns: [card(2, "Dos")] },
        { id: "d3", kind: "concepts", anchor: "P3", updatedAt: 3, turns: [card(3, "Tres")] },
        { id: "d4", kind: "practice", anchor: "P4", updatedAt: 4, turns: [card(4, "Cuatro")] },
      ], s.doubtCardLimit(7)).reduce((n, t) => n + t.turns.filter((x) => x.saved).length, 0),
      frontKeys: [s.cardFrontKey("<p><b>¿Qué hace la JVM?</b></p>"), s.cardFrontKey("¿que hace la jvm"), s.cardFrontKey("&lt;T&gt; genérico")],
      ids: [s.doubtThreadId("question", "¿Qué es?"), s.doubtThreadId("question", "¿Qué es?"), s.doubtThreadId("practice", "¿Qué es?")],
    };
  }));
  assert.equal(service.parsed.answer, "La **JVM** ejecuta el bytecode.");
  assert.deepEqual(service.parsed.quotes, ["the jvm reads the BYTECODE, and executes it on the actual machine"], "solo la cita literal (normalizada) sobrevive");
  assert.deepEqual(service.parsed.card, { front: "¿Qué ejecuta la JVM?", back: "El bytecode compilado por javac." });
  assert(service.outside.outside && service.outside.quotes.length === 0 && service.outside.card === null, "fuera de la lección: sin citas ni tarjeta");
  assert.equal(service.outside.answer, "Esto no se cubre.", "fuera de la lección empieza en mayúscula");
  assert.deepEqual(service.streaming.map((v) => v.text), ["", "La JVM ejecuta.", "La JVM ejecuta.", "No se cubre"], "el streaming no enseña prefijos ni CITA/TARJETA a medias");
  assert.equal(service.html.front, "¿Qué hace <code>&lt;T&gt;</code> en <b>genéricos</b>?");
  assert.equal(service.html.back, "<p><b>Usa &lt;b&gt;tipos&lt;/b&gt; &amp; &quot;más&quot;</b></p><blockquote>a &lt; b</blockquote>", "HTML escapado una sola vez");
  assert(service.order.transcript >= 0 && service.order.transcript < service.order.history
    && service.order.history < service.order.question, "el hilo va después de la transcripción y justo antes de la repregunta");
  assert(service.outsideCard.outside && service.outsideCard.quotes.length === 0 && service.outsideCard.card,
    "FUERA DE LA LECCIÓN puede proponer tarjeta válida y sigue sin citas");
  assert.equal(service.twoSentenceHtml.back,
    "<p><b>Compila a bytecode.</b></p><p>El intérprete lo ejecuta después.</p>", "respuesta directa en negrita, mecanismo en párrafo normal");
  assert.deepEqual(service.restored, [{ id: "t1", saved: 1, quotes: 2 }, { id: "t2", saved: 0, quotes: 2 }, { id: "t3", saved: 1, quotes: 2 }, { id: "t4", saved: 0, quotes: 2 }], "restaurar: 2 tarjetas, sin frentes repetidos, 2 citas; sin hilos de «marcas»");
  assert(!service.exportsList.some((name) => /Mark|videoSeconds/.test(name)), "sin API de marcas de vídeo");
  assert.deepEqual(service.limits, [2, 2, 3, 3], "tope de dudas: 2, o 3 con 6+ ideas");
  assert.equal(service.restoredDense, 3, "al restaurar una lección densa se conservan sus 3 tarjetas de duda");
  assert.equal(service.frontKeys[0], service.frontKeys[1], "el frente se compara sin HTML, tildes ni puntuación");
  assert.equal(service.frontKeys[2], "t generico");
  assert.deepEqual(service.upserted, ["a:La JVM ejecuta bytecode", "b:cambiado", "c:La JVM ejecuta bytecode"], "actualizar un hilo no lo mueve (el mazo no salta)");
  assert(service.prompt.includes("esta idea clave de la lección, tras intentar recordarla: «La JVM ejecuta bytecode»"), "la IA recibe la idea concreta");
  assert(service.prompt.includes("- El JIT compila el código caliente") && !service.prompt.includes("- La JVM ejecuta bytecode"), "las demás ideas van como contexto, sin repetir la anclada");
  assert.equal(service.ids[0], service.ids[1]);
  assert.notEqual(service.ids[0], service.ids[2]);
  for (const check of service.demoChecks) {
    assert(!check.outside && check.front, `demo «${check.q}» propone tarjeta`);
    assert(check.rawQuotes > 0 && check.verified === check.rawQuotes, `demo «${check.q}»: ${check.verified}/${check.rawQuotes} citas literales`);
  }
  assert.equal(new Set(service.demoChecks.map((c) => c.front)).size, service.demoChecks.length, "cada tema de la demo da una tarjeta distinta");
  assert(service.demoOutside.outside && !service.demoOutside.card && /^[A-ZÁÉÍÓÚ]/.test(service.demoOutside.answer), "demo fuera de la lección coherente");
  assert(!service.local.outside && service.local.quotes.length > 0 && service.local.card === null, "sin IA: fragmentos verificados, sin tarjeta");
  assert(service.localMiss.outside && service.localMiss.quotes.length === 0);
  assert(service.note.includes("## Dudas resueltas") && service.note.includes("> [!question]- ¿Qué hace la JVM?"), "la duda va en una línea");
  assert(service.note.includes("> > «The JVM reads the bytecode»") && service.note.includes("> **Fuera de la lección.** No se cubre."));
  assert(service.note.includes("2 de duda"));
  assert(!/<\/?(p|b|blockquote|code)>/.test(service.note), "la nota no arrastra el HTML de la tarjeta de duda");
  assert(service.note.includes("> **¿Qué hace `List<T>` en Java?**") && service.note.includes("> **Declara un genérico & tipado**"));
  {
    const lines = service.note.split("\n");
    const start = lines.findIndex((line) => line.startsWith("> [!example]- Tarjetas de esta lección"));
    const fold = lines.slice(start, lines.indexOf("", start));
    assert(fold.includes("> The JVM reads the bytecode") && fold.every((line) => line.startsWith(">")), "ninguna línea se sale del callout plegado");
  }
  // Obsidian: una URI por clic (Chrome bloquea la segunda), nota alineada con el flujo.
  const obsidian = await page.evaluate(async () => {
    const o = await import("/src/app/services/obsidianExport.ts");
    const opened = [];
    const grab = (event) => { const a = event.target.closest?.("a"); if (a?.href.startsWith("obsidian://")) { opened.push(decodeURIComponent(a.href)); event.preventDefault(); } };
    document.addEventListener("click", grab, true);
    const data = {
      courseName: "Java", lessonName: "JVM",
      unrecalledIdeas: ["El JIT compila el código caliente"], practiceToRedo: true,
      content: { relevance: { score: 80, reason: "r" }, keyConcepts: ["La JVM ejecuta bytecode", "El JIT compila el código caliente"], questions: [{ q: "¿Cuándo actúa el JIT?", bloom: "aplicar", difficulty: "clear", hint: "h", answer: "a" }], application: { isCode: false, setup: "s", challenge: "c", solution: "x" }, interviewQ: null, nextAction: "n", ankiCards: [] },
    };
    const config = { ...o.DEFAULT_OBSIDIAN_EXPORT_CONFIG, vaultName: "Vault QA" };
    const first = o.exportSessionToObsidian(data, config, { createdMocs: [] });
    const again = o.exportSessionToObsidian(data, config, { createdMocs: [first.moc.key] });
    // Ya exportada: se AÑADE un repaso al final (append), no se pisa la nota.
    const update = o.exportSessionUpdateToObsidian({ ...data, result: { title: "Lección completada", remembered: { count: 1, total: 2 }, check: { firstTry: 1, improved: 0, skipped: false }, practice: "done", cards: { total: 3, reinforce: 1, destination: "anki" } } }, config, { today: new Date("2026-11-05T10:00:00Z") });
    document.removeEventListener("click", grab, true);
    const key = o.sessionExportKey(config, "Java", "JVM");
    const note = o.buildSessionNoteMarkdown(data, config);
    const scaffold = o.buildVaultScaffold(config, { platform: "udemy" });
    return {
      opened: opened.length, firstOpensNote: opened[0]?.includes("file=wiki/fuentes/java---jvm.md"), moc: first.moc?.note.path, againMoc: again.moc, note, scaffold: { notes: scaffold.notes.length, folders: scaffold.folders },
      appendUri: opened[2] ?? "", updatePath: update.notePath,
      keys: { key, here: o.isSessionExported([key], config, "Java", "JVM"), otherVault: o.isSessionExported([key], { ...config, vaultName: "Otro" }, "Java", "JVM"), otherFolder: o.isSessionExported([key], { ...config, sourcesFolder: "notas" }, "Java", "JVM"), legacy: o.isSessionExported(["java---jvm"], config, "Java", "JVM") },
    };
  });
  assert.equal(obsidian.opened, 3, "cada export abre UNA URI (la nota) por clic; el índice no se abre solo");
  assert(obsidian.appendUri.includes("&append=true") && !obsidian.appendUri.includes("overwrite") && obsidian.appendUri.includes("## Repaso · 2026-11-05") && obsidian.appendUri.includes("### Resultado de la sesión") && !obsidian.appendUri.includes("type: sesion"), "el repaso se añade al final, sin frontmatter ni pisar la nota");
  assert.deepEqual(obsidian.keys, { key: "Vault QA|wiki/fuentes/java---jvm.md", here: true, otherVault: false, otherFolder: false, legacy: true }, `la nota ya exportada se reconoce por vault y carpeta: ${JSON.stringify(obsidian.keys)}`);
  assert(obsidian.firstOpensNote && obsidian.moc === "cursos/java.md" && obsidian.againMoc === null, "el índice del curso se ofrece aparte y una sola vez");
  assert(obsidian.note.includes("## Preguntas para comprobarte") && obsidian.note.includes("_(usar en un caso)_") && !/\b(confused|partial|clear|mastered)\b/.test(obsidian.note), "preguntas con el nombre del paso y sin la dificultad interna");
  assert(obsidian.note.includes("No me salieron sin mirar:\n- El JIT compila el código caliente") && obsidian.note.includes("Repetir la práctica sin mirar la solución"), "«Puntos a reforzar» = lo mismo que Anki refuerza");
  assert(obsidian.scaffold.notes >= 7 && obsidian.scaffold.folders.includes("wiki/fuentes") && obsidian.scaffold.folders.includes("cursos"), "la estructura del vault va en un .zip con sus carpetas");
  // Progreso y racha: una sola regla (cualquier actividad de estudio cuenta) y cifras que sí se mueven.
  const progress = await page.evaluate(async () => {
    const pr = await import("/src/app/services/progress.ts");
    const st = await import("/src/app/services/streak.ts");
    const keys = ["kinema-progress", "kinema-streak", "kinema-streak-shown"];
    const backup = keys.map((k) => localStorage.getItem(k));
    keys.forEach((k) => localStorage.removeItem(k));
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
    const miss = pr.recordActivity("first_try_miss");
    const afterMiss = { streak: st.getStreak(), p: pr.getProgress(), unlocked: miss.unlocked.map((a) => a.id) };
    pr.recordActivity("answer_improved");
    const oneDay = st.claimStreakCelebration();
    // Ayer ya estudió: hoy la racha sube a 2 y se celebra UNA vez.
    localStorage.setItem("kinema-streak", JSON.stringify({ last: day(1), count: 1, best: 4 }));
    pr.recordActivity("answer_submitted");
    const claim1 = st.claimStreakCelebration();
    const claim2 = st.claimStreakCelebration();
    const final = pr.getProgress();
    keys.forEach((k, i) => backup[i] === null ? localStorage.removeItem(k) : localStorage.setItem(k, backup[i]));
    return { afterMiss: { streak: afterMiss.streak, answered: afterMiss.p.answered, correct: afterMiss.p.correct, unlocked: afterMiss.unlocked }, improved: final.improved, oneDay, claim1, claim2, best: final.bestStreak };
  });
  assert.deepEqual(progress.afterMiss, { streak: 1, answered: 1, correct: 0, unlocked: ["first"] }, `responder (aunque falles) ya cuenta para la racha y «Primer paso»: ${JSON.stringify(progress.afterMiss)}`);
  assert.equal(progress.improved, 1, "«Corregidas tras revisar» se mueve (antes «Puntos reforzados» siempre en 0)");
  assert.equal(progress.oneDay, null, "con 1 día no hay celebración de racha");
  assert.deepEqual([progress.claim1?.count, progress.claim2], [2, null], "la racha se celebra una vez al día");
  assert.equal(progress.best, 4, "«mejor racha» es la de siempre, no solo la de 5 semanas");
  console.log("PASS servicio: citas literales, formato y streaming, HTML escapado una vez, topes y unicidad, orden estable, idea anclada en el prompt, demo coherente, nota de Obsidian, sin marcas de vídeo");

  // ── 1b. Página de Udemy sin subtítulos: artículo, cuestionario y «Siguiente» (DOM sintético) ──
  const udemy = await stage("udemy", () => page.evaluate(async () => {
    const u = await import("/src/app/services/udemyLecture.ts");
    const make = (html) => { const d = document.implementation.createHTMLDocument("x"); d.body.innerHTML = html; return d; };
    const para = "La JVM ejecuta el bytecode que genera javac. ".repeat(10);
    const article = make(`<div class="article-asset--content--x1"><h2>Bytecode</h2><p>${para}</p><ul><li><p>Paso uno del proceso.</p></li></ul><pre>int x = 1;\nint y = 2;</pre></div><div role="tabpanel"><div class="article-asset--content--q">${para}${para}</div></div>`);
    const text = u.collectArticleText(22000, article);
    const quiz = make(`<div data-purpose="quiz">Pregunta 1 de 10</div>`);
    const video = make(`<video></video><div class="article-asset--content">${para}</div>`);
    let clicked = "";
    const nav = make(`<ul><li aria-current="true"><span data-purpose="item-title">A</span></li><li><div data-purpose="curriculum-item-1-2"><span data-purpose="item-title">B</span></div></li></ul>`);
    nav.querySelector('[data-purpose="curriculum-item-1-2"]').addEventListener("click", () => { clicked = "B"; });
    const navOk = u.goToNextLecture(nav);
    const last = make(`<ul><li aria-current="true"><span data-purpose="item-title">Z</span></li></ul>`);
    let nextBtn = false;
    const player = make(`<button data-purpose="go-to-next-button">Next</button>`);
    player.querySelector("button").addEventListener("click", () => { nextBtn = true; });
    return {
      kinds: [u.getLectureKind(article), u.getLectureKind(quiz), u.getLectureKind(video)],
      text: text?.text ?? "", source: text?.source, blocks: text?.cueCount,
      navOk, clicked, lastOk: u.goToNextLecture(last), playerOk: u.goToNextLecture(player), nextBtn,
    };
  }));
  assert.deepEqual(udemy.kinds, ["article", "other", "video"], "tipo de lección: texto, cuestionario, video");
  assert(udemy.source === "article-text" && udemy.text.startsWith("Bytecode\nLa JVM") && udemy.text.includes("int x = 1;\nint y = 2;"), `texto del artículo con el código intacto: ${udemy.text.slice(0, 80)}`);
  assert.equal((udemy.text.match(/Paso uno/g) || []).length, 1, "sin repetir párrafos anidados");
  // El bloque del panel de pestañas (Q&A) es más largo: si no se excluyera, ganaría por tamaño.
  assert(udemy.text.length < 700, "no lee el panel de pestañas (Q&A)");
  assert(udemy.navOk && udemy.clicked === "B", "«Siguiente» por el temario");
  assert.equal(udemy.lastOk, false, "en la última lección dice que no (no inventa)");
  assert(udemy.playerOk && udemy.nextBtn, "«Siguiente» del reproductor si existe");
  // Plan de Comprobar: tamaño según la lección (nº de ideas) y lo que NO marcaste.
  const plan = await page.evaluate(async () => {
    const p = await import("/src/app/services/checkPlan.ts");
    const q = (difficulty, conceptRefs) => ({ difficulty, conceptRefs });
    const lesson = (n, qs) => ({ keyConcepts: Array.from({ length: n }, (_, i) => `idea ${i}`), questions: qs });
    // Una pregunta por idea + síntesis (el esquema que pide el prompt).
    const short = lesson(2, [q("confused", [0]), q("partial", [1]), q("mastered", [0, 1])]);
    const medium = lesson(3, [q("confused", [0]), q("partial", [1]), q("clear", [2]), q("mastered", [1, 2])]);
    const dense = lesson(7, [q("confused", [0]), q("partial", [1]), q("partial", [2]), q("clear", [3]), q("clear", [4]), q("partial", [5]), q("clear", [6]), q("mastered", [2, 4, 6])]);
    // Misma lección densa con una síntesis que no ayuda a cubrir: aquí actúa el tope.
    const denseCap = lesson(7, [...dense.questions.slice(0, 7), q("mastered", [0, 1])]);
    const orphan = lesson(4, [q("confused", [0]), q("partial", [1]), q("clear", [2]), q("mastered", [0, 1])]); // idea 3 sin pregunta
    const st = (c, queue, marked) => { const r = p.checkPlanState(c, queue, new Set(marked)); return { total: r.total, uncovered: r.uncovered.length }; };
    const run = (c, start, marked) => {
      const queue = [start];
      for (let n = p.pickNextCheckQuestion(c, queue, new Set(marked), 1); n; n = p.pickNextCheckQuestion(c, queue, new Set(marked), 1)) queue.push(n.i);
      return queue;
    };
    return {
      short: [st(short, [0], [0, 1]), st(short, [0], []), st(short, [1], [0])],
      medium: [st(medium, [1], [0, 1, 2]), st(medium, [1], [0, 1]), st(medium, [1], [0]), st(medium, [1], [])],
      dense: [st(dense, [3], [0, 1, 2, 3, 4, 5, 6]), st(dense, [3], [0, 1, 2]), st(dense, [1], []), st(denseCap, [1], [])],
      orphan: st(orphan, [0], []),
      // La simulación del total coincide con lo que de verdad se pregunta.
      runs: [run(medium, 1, []).length, run(medium, 1, [0]).length, run(dense, 1, []).length, run(dense, 3, [0, 1, 2]).length],
      spotKind: p.pickNextCheckQuestion(medium, [1, 2], new Set([0]))?.kind,
      afterRight: p.pickNextCheckQuestion(medium, [2], new Set(), 3)?.i,
      afterWrong: p.pickNextCheckQuestion(medium, [2], new Set(), 1)?.i,
      // Releer una cola guardada: el reto (fuera del plan) queda al final y no cuenta en el plan.
      replay: p.checkPlanState(medium, [1, 0, 2, 3], new Set()).planned,
      order: p.orderPresented(medium, 1, [0, 1, 2, 3], new Set()),
      cov: p.conceptCoverage({ ...orphan, ankiCards: [{ conceptRefs: [0] }, { conceptRefs: [0] }, { conceptRefs: [9] }, { conceptRefs: [1], excluded: true }] }),
    };
  });
  const T = (total, uncovered = 0) => ({ total, uncovered });
  assert.deepEqual(plan.short, [T(1), T(2), T(2)], `lección corta: 1 si recordaste todo, 2 como mucho: ${JSON.stringify(plan.short)}`);
  assert.deepEqual(plan.medium, [T(1), T(2), T(3), T(3)], `lección media: una por idea no marcada + una de confirmación: ${JSON.stringify(plan.medium)}`);
  // Sin marcar nada: la síntesis cubre 3 ideas de una vez y todo cabe en 5; si no, el tope deja 2 para Anki (y se dice).
  assert.deepEqual(plan.dense, [T(1), T(3), T(5), T(5, 2)], `lección densa: crece con la lección, tope de fatiga 5 y lo que queda va a Anki: ${JSON.stringify(plan.dense)}`);
  assert.deepEqual(plan.orphan, T(3, 1), "una idea sin pregunta no se inventa: se dice y va a Anki");
  assert.deepEqual(plan.runs, [3, 3, 5, 3], `el total anunciado es el que se pregunta: ${JSON.stringify(plan.runs)}`);
  assert.equal(plan.spotKind, "spot", "con lo no marcado cubierto, confirma una idea marcada");
  assert.equal(plan.afterRight, 3, "tras acertar, otra idea a un nivel más alto");
  assert.equal(plan.afterWrong, 1, "tras fallar, otra idea a un nivel más bajo");
  assert.equal(plan.replay, 3, "el reto no cuenta como pregunta del plan");
  assert.deepEqual(plan.order, [1, 0, 2, 3], "la cola guardada se relee en el orden del plan");
  assert.deepEqual([plan.cov.ideasWithoutQuestion, plan.cov.ideasWithoutCard, plan.cov.invalidRefs], [[3], [1, 2, 3], 1], `cobertura: ideas huérfanas, sin tarjeta y refs inválidas: ${JSON.stringify(plan.cov)}`);
  const ideas = await page.evaluate(async () => {
    const pr = await import("/src/shared/prompts.ts");
    const cp = await import("/src/app/services/checkPlan.ts");
    const t = (n) => "palabra ".repeat(n);
    const sizes = [200, 500, 1000, 2000]; // ×8 caracteres: corta, breve, normal, densa
    const prompt = pr.buildStudyPrompt(t(200), { courseName: "C", lessonName: "L" });
    // Los ejemplos del prompt (que el modelo imita) cubren todas sus ideas con preguntas y tarjetas.
    const examples = ["EJEMPLO A", "EJEMPLO B"].map((tag, k, all) => {
      const from = prompt.indexOf(tag);
      const chunk = prompt.slice(from, k + 1 < all.length ? prompt.indexOf(all[k + 1]) : undefined);
      const json = JSON.parse(chunk.slice(chunk.indexOf("{"), chunk.lastIndexOf("}") + 1).replace(/\n\s*\}\s*\n[\s\S]*$/, "\n}"));
      const cov = cp.conceptCoverage(json);
      return { n: json.keyConcepts.length, q: json.questions.length, orphanQ: cov.ideasWithoutQuestion.length, orphanC: cov.ideasWithoutCard.length, invalid: cov.invalidRefs };
    });
    return {
      ranges: sizes.map((n) => pr.keyConceptRange(t(n))),
      cards: sizes.map((n) => pr.estimateAnkiCardTarget(t(n))),
      prompt: /entre 2 y 3 keyConcepts/.test(prompt) && /Total = número de keyConcepts \+ 1/.test(prompt) && /al menos una tarjeta por keyConcept/.test(prompt) && !/exactamente 4 preguntas/.test(prompt),
      examples,
    };
  });
  assert.deepEqual(ideas.ranges, [{ min: 2, max: 3 }, { min: 3, max: 4 }, { min: 4, max: 5 }, { min: 5, max: 7 }], `ideas clave: un rango por densidad, la IA elige: ${JSON.stringify(ideas.ranges)}`);
  assert(ideas.cards.every((c, i) => c.max >= ideas.ranges[i].max), "siempre cabe al menos una tarjeta por idea");
  assert(ideas.prompt, "el prompt pide una pregunta por idea + síntesis y una tarjeta por idea");
  for (const ex of ideas.examples) assert.deepEqual([ex.q, ex.orphanQ, ex.orphanC, ex.invalid], [ex.n + 1, 0, 0, 0], `ejemplo del prompt coherente: ${JSON.stringify(ex)}`);
  console.log("PASS plan de Comprobar proporcional: corta ≤2, media ≤3, densa ≤5 (tope de fatiga, el resto a Anki); una por idea no marcada + una de confirmación; ideas huérfanas detectadas; ejemplos del prompt sin huecos");
  console.log("PASS Udemy sin subtítulos: lección de texto leída sin Q&A ni duplicados, cuestionario reconocido, «Siguiente» por reproductor o temario y «no» honesto al final");

  const demoTranscript = await page.evaluate(async () => (await import("/src/app/services/prototypeData.ts")).prototypeDoubtDemo().transcript);
  const norm = (value) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const assertQuotesLiteral = async (scope) => {
    const quotes = await scope.locator("blockquote").allInnerTexts();
    assert(quotes.length > 0, "hay citas");
    for (const quote of quotes) assert(` ${norm(demoTranscript)} `.includes(` ${norm(quote.replace(/[«»]/g, ""))} `), `cita literal: ${quote}`);
  };
  const ask = async (panel, question, turns) => {
    await panel.locator("textarea").fill(question);
    await panel.getByRole("button", { name: turns ? "Repreguntar" : "Preguntar", exact: true }).click();
    await panel.locator("[data-doubt-turn]").nth(turns).waitFor({ timeout: 20000 });
    return panel.locator("[data-doubt-turn]").nth(turns);
  };
  const next = page.getByRole("button", { name: "Siguiente", exact: true });
  const oldSkipLabels = /Saltar comprobación|Hacerlo después|Continuar de todas formas|Omitir por ahora/;
  // Quien actúa es Kinema, no «la IA» (la IA solo se nombra como proveedor en Ajustes).
  const noAiActor = async (where) => assert.equal(await page.locator(".usb-dock").getByText(/\bla IA\b|\bcon IA\b|IA real/).count(), 0, `sin «la IA» en ${where}`);

  // ── 2. Recordar: lo que pide el paso, a la vista ──────────────────────────
  await stage("recordar", async () => {
    await page.getByText("Continuar sin cuenta", { exact: true }).click();
    await page.getByPlaceholder("Ej: Conseguir trabajo en fintech como Java dev en 3 meses…").fill("Entender cómo la JVM ejecuta Java");
    await page.getByRole("button", { name: /Generar sesión de aprendizaje|Empezar/ }).click();
    await page.getByRole("button", { name: /^Entendido/ }).click({ timeout: 30000 });
    await page.locator("[data-level-summary]").waitFor();
    assert.equal(await page.locator("[data-level-picker]").count(), 0, "el selector de nivel se pliega al elegir");
    const recall = page.locator("[data-recall-card]");
    await recall.waitFor();
    // Pantalla directa: una pregunta y una frase, nada más.
    assert((await recall.innerText()).includes("¿Puedes explicarlo sin mirar?"), "el paso se entiende con una pregunta");
    assert.equal((await recall.locator("[data-recall-instructions]").innerText()).trim(), "Intenta responder cada pregunta sin mirar antes de elegir.");
    assert.equal(await page.getByText(/Marca solo las que te vinieron|Comprobar te pregunta por cada una|Sin marcar ninguna|empezamos por lo esencial|Marca las ideas que ya tenías|toca \? para|Base sólida|guía tus preguntas|¿Cuáles recordaste\?/).count(), 0, "sin los textos largos o ambiguos de antes");
    const rows = recall.locator("[data-recall-ideas] > li");
    const nConcepts = await rows.count();
    assert.equal(nConcepts, 4, "las 4 ideas de la lección de la demo");
    // La pista (título) a la vista; el detalle, oculto hasta responder; sin dudas antes de intentar.
    assert.equal(await recall.locator("[data-recall-detail]").count(), 0, "el detalle se ve al responder, no antes");
    assert.equal(await page.locator("[data-doubt-trigger]").count(), 0, "sin dudas antes de intentar recordar");
    assert((await rows.nth(0).innerText()).includes("¿Qué genera javac al compilar?"), "cada idea se presenta como pregunta concreta");
    // El recuerdo libre es opcional y está plegado, a la vista tras elegir el nivel.
    const freeToggle = recall.locator("[data-free-recall-toggle]");
    await page.waitForTimeout(400);
    const banner = await page.getByText("Sincronizar en la nube", { exact: true }).boundingBox().catch(() => null);
    const visibleBottom = banner ? banner.y : page.viewportSize().height;
    const box = await freeToggle.boundingBox();
    assert(box && box.y + 24 < visibleBottom, `el recuerdo libre queda a la vista tras elegir el nivel (y=${Math.round(box?.y)}, visible hasta ${Math.round(visibleBottom)})`);
    assert((await freeToggle.innerText()).includes("opcional"), "se dice que es opcional");
    await freeToggle.click();
    const recallBox = page.getByPlaceholder("Lo que recuerdo es…");
    await recallBox.fill("La JVM ejecuta el bytecode que genera javac.");
    // «Lo sabía» y «No del todo»: el mismo esfuerzo (mismo tamaño), ninguno destacado.
    const knew = (i) => rows.nth(i).locator("[data-recall-mark='knew']");
    const unsure = (i) => rows.nth(i).locator("[data-recall-mark='unsure']");
    const [bk, bu] = [await knew(0).boundingBox(), await unsure(0).boundingBox()];
    assert(Math.abs(bk.width - bu.width) <= 1 && Math.abs(bk.height - bu.height) <= 1, `dos botones del mismo peso: ${JSON.stringify([bk, bu])}`);
    // El CTA dice cuántas preguntas habrá con lo que respondes (el plan real).
    const cta = recall.getByRole("button", { name: /^Ponerme a prueba · \d+ preguntas?$/ });
    assert.equal(await cta.innerText(), "Ponerme a prueba · 3 preguntas", "sin responder: una por idea no clara");
    await recall.locator("[data-recall-pending]").getByText("Las que dejes sin marcar pasan a practicarse en el siguiente paso.").waitFor();
    await knew(0).click();
    await rows.nth(0).locator("[data-recall-mark='knew'][aria-pressed='true']").waitFor();
    assert.equal(await rows.nth(0).locator("[data-recall-detail]").innerText(), "javac compila el fuente a bytecode (.class), no a código nativo", "al responder, el detalle (la respuesta)");
    assert.equal(await page.locator("[data-doubt-trigger]").count(), 1, "«Duda» aparece en la idea respondida");
    // Cambiar de opinión tras ver el detalle es honesto y se permite.
    await knew(1).click();
    await unsure(1).click();
    await rows.nth(1).locator("[data-recall-mark='unsure'][aria-pressed='true']").waitFor();
    assert.equal(await rows.nth(1).locator("[data-recall-mark='knew']").getAttribute("aria-pressed"), "false");
    assert.equal(await recall.locator("[data-recall-pending]").innerText(), "2 sin marcar · pasan a practicarse en Comprobar.");
    // Sabías la 1: Comprobar confirma esa (y pregunta las otras): sigue en 3.
    assert.equal(await cta.innerText(), "Ponerme a prueba · 3 preguntas", "el número sale del plan real");
    const doubtButtons = recall.getByRole("button", { name: "Tengo una duda sobre esta idea" });
    assert.equal(await doubtButtons.count(), 2, "una «Duda» por idea respondida");
    assert.equal((await doubtButtons.first().innerText()).trim(), "Duda", "el botón de duda se lee, no es un ? suelto");
    // Duda sobre la primera idea: pregunta + 2 repreguntas, la última fuera de la lección
    const trigger = rows.nth(0).getByRole("button", { name: "Tengo una duda sobre esta idea" });
    await trigger.click();
    const concepts = page.locator("[data-lesson-doubt='concepts']");
    await concepts.waitFor();
    assert((await concepts.innerText()).includes("Sobre la idea:"));
    assert(await concepts.locator("textarea").evaluate((el) => el === document.activeElement), "el foco entra al campo");
    const first = await ask(concepts, "¿Qué diferencia hay entre el JDK y el JRE?", 0);
    await assertQuotesLiteral(concepts);
    assert.equal(await first.getByText("Local", { exact: true }).count(), 1, "la demo se marca como Local");
    await first.getByRole("button", { name: "Guardar como tarjeta" }).click();
    await first.getByText("Tarjeta en tu mazo").waitFor();
    await ask(concepts, "¿Y quién libera la memoria?", 1);
    assert((await concepts.innerText()).includes("Te queda 1 repregunta"));
    const last = await ask(concepts, "¿Esto vale igual en Kotlin?", 2);
    assert.equal(await last.getByText("Fuera de la lección", { exact: true }).count(), 1);
    assert.equal(await last.locator("blockquote").count(), 0, "fuera de la lección: sin citas");
    assert.equal(await last.locator("[data-doubt-card]").count(), 0, "fuera de la lección: sin tarjeta");
    assert(/^[A-ZÁÉÍÓÚ]/.test((await last.locator("p").nth(1).innerText()).trim()), "empieza en mayúscula");
    assert.equal(await concepts.locator("textarea").count(), 0, "máximo de repreguntas");
    await concepts.getByText("Llegaste al máximo de repreguntas", { exact: false }).waitFor();
    assert(await concepts.getByRole("button", { name: "Cerrar duda" }).evaluate((el) => el === document.activeElement), "el foco no se pierde al llegar al tope");
    for (const pass of [1, 2]) {
      await page.waitForTimeout(450);
      const { checked, failures } = await contrastAudit("[data-recall-card], [data-level-summary]");
      assert(checked > 25, `contraste: ${checked} textos revisados`);
      assert.deepEqual(failures, [], `contraste AA en Recordar (tema ${pass})`);
      await page.screenshot({ path: `/tmp/kinema-recordar-tema${pass}.png` });
      await page.getByRole("button", { name: /Cambiar a tema (claro|oscuro)/ }).click();
    }
    await concepts.getByRole("button", { name: "Cerrar duda" }).focus();
    await page.keyboard.press("Escape");
    await concepts.waitFor({ state: "detached" });
    assert(await trigger.evaluate((el) => el === document.activeElement), "Escape cierra y devuelve el foco al ? de la idea");
    // Lo respondido llega al historial antes de comprobar (no es una pantalla decorativa).
    const marks = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && /whatisjava/.test(k));
      const rec = key ? JSON.parse(localStorage.getItem(key)) : null;
      return rec ? { marks: rec.recallMarks, checked: rec.checkedConceptIndexes } : null;
    });
    assert.deepEqual(marks, { marks: ["knew", "unsure", null, null], checked: [0] }, `«Lo sabía» / «No del todo» en el historial: ${JSON.stringify(marks)}`);
    // «Siguiente» de arriba hace lo mismo que «Ponerme a prueba» (y guarda el recuerdo).
    assert(await next.isEnabled(), "con el nivel elegido se puede avanzar");
    await next.click();
  });
  console.log("PASS Recordar: «¿Lo recordabas?» en una frase, título → «Lo sabía»/«No del todo» del mismo peso → detalle, recuerdo libre opcional y plegado, CTA con el nº real de preguntas, marcas en el historial, «Duda» tras responder, citas literales, tarjeta, 2 repreguntas, fuera de la lección, foco y Escape, «Siguiente» = «Ponerme a prueba», contraste AA en ambos temas");

  // ── 3. Comprobar: salto común; el feedback no desaparece ──────────────────
  await stage("comprobar", async () => {
    const answerBox = page.getByPlaceholder("Escribe tu respuesta con tus propias palabras…");
    await answerBox.waitFor();
    assert(await next.isDisabled(), "«Siguiente» espera a responder o saltar");
    assert.equal(await page.getByRole("button", { name: "Saltar este paso" }).count(), 1, "un solo salto, el común");
    assert.equal(await page.getByText(oldSkipLabels).count(), 0, "sin rótulos de salto distintos");
    assert.equal(await page.locator("[data-doubt-trigger]").count(), 0, "sin duda antes del intento");
    assert.deepEqual((await contrastAudit("[data-skip-step]")).failures, [], "el salto cumple AA");
    // Saltar por error no es definitivo: se puede responder ahora.
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    const skipped = page.locator("[data-skipped-step='comprobar']");
    await skipped.waitFor();
    await page.locator("[data-sonner-toast]").filter({ hasText: "Comprobación saltada" }).getByRole("button", { name: "Deshacer" }).waitFor();
    // Un solo sitio para los avisos: abajo y centrados DENTRO del panel (no sobre el vídeo).
    const skipSettle = await settleToast({ text: "Comprobación saltada" });
    assert(skipSettle.ok, `el aviso de salto termina de entrar: ${JSON.stringify(skipSettle)}`);
    const placement = await page.evaluate(() => {
      const t = [...document.querySelectorAll("[data-sonner-toast]")].find((el) => el.dataset.removed !== "true" && el.textContent.includes("Comprobación saltada")).getBoundingClientRect();
      const d = document.querySelector(".usb-dock").getBoundingClientRect();
      return { inside: t.left >= d.left && t.right <= d.right && t.bottom <= d.bottom, centered: Math.abs((t.left + t.right) / 2 - (d.left + d.right) / 2) < 24, low: t.top > d.top + d.height / 2 };
    });
    assert.deepEqual(placement, { inside: true, centered: true, low: true }, `aviso dentro del panel, abajo y centrado: ${JSON.stringify(placement)}`);
    assert(await next.isEnabled(), "saltada, se puede avanzar");
    await page.waitForTimeout(350);
    assert.deepEqual((await contrastAudit("[data-skipped-step]")).failures, [], "el aviso de salto cumple AA");
    await skipped.getByRole("button", { name: "Responder ahora" }).click();
    await answerBox.waitFor();
    assert(await next.isDisabled(), "al deshacer, «Siguiente» vuelve a esperar la respuesta");
    assert.equal(await skipped.count(), 0, "el aviso de salto desaparece");
    // Respuesta incompleta: la revisión se lee por secciones y la única botonera es «¿Cómo sigues?».
    await answerBox.fill("La JVM ejecuta Java.");
    await page.getByRole("button", { name: "Revisar mi respuesta" }).click();
    const moves = page.locator("[data-next-moves]");
    await moves.waitFor({ timeout: 30000 });
    const feedback = page.locator("[data-question-card] [data-feedback]");
    const fbText = await feedback.innerText();
    assert(fbText.includes("Revisión de Kinema") && fbText.includes("Lo que faltó") && fbText.includes("Para recordar"), `revisión por secciones: ${fbText}`);
    assert(!/\[(INCORRECTO|PARCIAL|CORRECTO)\]|FALTO:|BIEN:|la IA/.test(fbText), "sin etiquetas crudas ni «la IA»");
    assert.equal(await page.getByText(/Reescribir|Respuesta modelo|Reevaluar con IA|Terminar comprobación|Ver pista de apoyo|cuenta como intento|Mejorar mi respuesta|Es un nuevo intento|más básica/).count(), 0, "sin las opciones ambiguas de antes");
    assert.equal(await moves.locator("[data-move]").count(), 2, "dos opciones, nada más");
    const movesText = await moves.innerText();
    // El plan anunciado en Recordar (3): la de tu nivel, la que cubre lo no claro y la confirmación de lo que sabías.
    assert((await page.locator("[data-question-card]").locator("..").locator("..").innerText()).includes("Pregunta 1 de 3"), "se ve el tamaño de la comprobación (el mismo que anunció Recordar)");
    assert.equal(await page.locator("[data-plan-why]").innerText(), "Sobre una idea que no tenías clara, al nivel que elegiste.", "cada pregunta dice por qué se hace");
    // La 1.ª pregunta sale de las marcas FINALES (no de cuando se eligió el nivel).
    assert((await page.locator("[data-question-card]").innerText()).includes("por qué no es tan lento"), "arranca por una idea que no tenías clara, a tu nivel");
    assert(movesText.includes("Intentarlo de nuevo") && movesText.includes("Siguiente pregunta (2 de 3)") && movesText.includes("Sobre otra idea") && movesText.includes("Terminar aquí"), `cada opción se explica sola: ${movesText}`);
    assert.equal(await moves.locator("[data-doubt-trigger]").count(), 1, "«Tengo una duda» en el mismo bloque que las opciones");
    assert.equal(await page.locator("[data-question-card] [data-feedback] [data-doubt-trigger]").count(), 0, "y no lejos, dentro de la revisión");
    assert.equal(await page.getByRole("button", { name: "Saltar este paso" }).count(), 0, "revisada, ya no se salta (se elige cómo seguir)");
    assert(await next.isEnabled(), "con una respuesta revisada, «Siguiente» termina la comprobación");
    for (const pass of [1, 2]) {
      await page.waitForTimeout(450);
      const { checked, failures } = await contrastAudit("[data-question-card]");
      assert(checked > 15, `contraste: ${checked} textos revisados`);
      assert.deepEqual(failures, [], `contraste AA en la revisión y «¿Cómo sigues?» (tema ${pass})`);
      await page.getByRole("button", { name: /Cambiar a tema (claro|oscuro)/ }).click();
    }
    // «Mejorar» = nuevo intento sobre lo escrito (no lo borra); al cambiarlo, «Revisar de nuevo».
    await moves.locator("[data-move='improve']").click();
    assert(await answerBox.evaluate((el) => el === document.activeElement && el.value === "La JVM ejecuta Java."), "el foco vuelve a tu respuesta, sin borrarla");
    await answerBox.fill("La JVM interpreta el bytecode y el JIT compila a código nativo las partes más usadas, por eso Java es portable.");
    await page.getByText("Esta revisión es de tu versión anterior.").waitFor();
    await moves.locator("[data-move='retry']").click();
    // Acertó, pero queda plan: «Siguiente pregunta» como principal y «Terminar aquí» siempre a mano.
    const nextQ = moves.locator("[data-move='next']");
    await nextQ.waitFor({ timeout: 30000 });
    assert(/kx-cta/.test(await nextQ.getAttribute("class")), "tras acertar, seguir es lo principal");
    assert.equal(await moves.locator("[data-move='improve'], [data-move='retry']").count(), 0, "acertada: no se ofrece reintentar");
    await moves.locator("[data-move-exit]").click();
    const continueBtn = page.getByRole("button", { name: "Continuar a Aplicar" });
    await continueBtn.waitFor({ timeout: 30000 });
    const review = page.locator("[data-verify-review]");
    assert((await review.innerText()).includes("Comprobación terminada"), "el repaso dice que el paso terminó");
    await review.locator("[data-show-expected]").first().click();
    await review.locator("[data-reference-answer]").first().waitFor();
    // «Un reto más»: opcional, de nivel más alto; dejarlo vuelve al repaso.
    await review.locator("[data-challenge]").click();
    await page.getByText("Un reto más · opcional", { exact: true }).waitFor();
    assert(await next.isEnabled(), "el reto no bloquea");
    await answerBox.fill("No lo sé.");
    await page.getByRole("button", { name: "Revisar mi respuesta" }).click();
    await moves.locator("[data-move='leave']").click({ timeout: 30000 });
    await review.waitFor();
    assert.equal(await review.locator("[data-challenge]").count(), 0, "un solo reto por lección");
    await noAiActor("Comprobar");
    // Al completarse, la última respuesta queda ABIERTA: su feedback y la duda siguen a la vista.
    const trig = page.locator("[data-doubt-trigger]").filter({ hasText: "Tengo una duda" }).first();
    await trig.waitFor({ timeout: 5000 });
    assert(await next.isEnabled(), "respondida, «Siguiente» avanza");
    await trig.click();
    const question = page.locator("[data-lesson-doubt='question']");
    await question.waitFor();
    assert((await question.innerText()).includes("Sobre la pregunta:"));
    const turn = await ask(question, "¿Por qué el bytecode es portable?", 0);
    await assertQuotesLiteral(question);
    await turn.getByRole("button", { name: "Guardar como tarjeta" }).click();
    await turn.getByText("Tarjeta en tu mazo").waitFor();
    await continueBtn.click();
  });
  console.log("PASS Comprobar: saltar se deshace, revisión de Kinema por secciones, «¿Cómo sigues?» con 2 opciones explicadas (nuevo intento / otra pregunta), mejorar sin borrar, respuesta esperada al cerrar, reto opcional que se puede dejar, contraste AA, duda anclada a la pregunta, tarjeta guardada");

  // ── 4. Aplicar: misma regla; bonus solo tras intentar; tope y duplicados ──
  await stage("aplicar", async () => {
    const board = page.locator("[data-structured-practice='completar']");
    await board.waitFor();
    const blank = (n) => board.getByRole("textbox", { name: `Hueco ${n}` });
    assert(await next.isDisabled(), "«Siguiente» espera a intentar o saltar (como en Comprobar)");
    assert.equal(await page.getByRole("button", { name: "Saltar este paso" }).count(), 1, "el mismo salto");
    assert.equal(await page.getByText(oldSkipLabels).count(), 0, "sin rótulos de salto distintos");
    assert.equal(await page.locator("[data-doubt-trigger]").count(), 0, "sin duda antes de intentarlo");
    // Ejercicio corto con huecos (no escribir el programa desde cero), corregido al momento.
    assert.equal(await board.getByRole("textbox").count(), 2, "dos huecos");
    assert((await board.innerText()).includes("Completar") && (await board.innerText()).includes("Escribe solo lo que falta"), "formato e instrucción en una línea");
    assert.equal(await page.getByPlaceholder(/tu solución aquí…|tu respuesta aquí…/i).count(), 0, "sin el campo en blanco de antes");
    // Las dos formas de practicar se ven ANTES del salto (no plegadas debajo).
    const modes = page.locator("[data-practice-modes]");
    const explainTab = modes.getByRole("tab", { name: /Explicarlo/ });
    assert((await explainTab.boundingBox()).y < (await page.locator("[data-skip-step]").boundingBox()).y, "«Explicarlo» está antes de «Saltar este paso»");
    assert((await modes.getByRole("tab", { name: /Completar/ }).innerText()).includes("Se corrige al momento"), "la forma estructurada dice que se corrige al momento");
    assert.equal(await page.getByText(/Prefieres explicarlo|opcional, 1 min/).count(), 0, "sin la práctica oral plegada al fondo");
    for (const pass of [1, 2]) {
      await page.waitForTimeout(350);
      assert.deepEqual((await contrastAudit("[data-practice-modes], [data-practice-structured]")).failures, [], `contraste AA en Aplicar (tema ${pass})`);
      await page.getByRole("button", { name: /Cambiar a tema (claro|oscuro)/ }).click();
    }
    await explainTab.click();
    const explain = page.locator("[data-practice-explain]");
    await explain.waitFor();
    assert((await explain.innerText()).includes("en un minuto"), "la pregunta se entiende sin «60 segundos» ni plantillas raras");
    await explain.getByPlaceholder("Escribe tu explicación con tus palabras…").waitFor();
    assert.equal(await page.getByRole("button", { name: "Saltar este paso" }).count(), 1, "el mismo salto en las dos formas");
    await modes.getByRole("tab", { name: /Completar/ }).click();
    await board.waitFor();
    // Saltar la práctica y volver desde el resumen («Hacerla»).
    await page.getByRole("button", { name: "Saltar este paso" }).click();
    const summary = page.locator("[data-lesson-summary]");
    await summary.waitFor();
    assert((await summary.innerText()).includes("Lección con pasos pendientes"), "el título nombra lo pendiente");
    await summary.getByRole("button", { name: "Hacerla" }).click();
    await page.locator("[data-skipped-step='aplicar']").waitFor();
    const check = board.getByRole("button", { name: /^Comprobar/ });
    assert(await check.isDisabled(), "con huecos vacíos no se comprueba");
    // 1.º intento: un hueco mal → se marca cuál, sin decir la respuesta.
    await blank(1).fill("java");
    await blank(2).fill("java");
    await check.click();
    const result = board.locator("[data-practice-result]");
    await result.waitFor();
    assert.equal(await result.getAttribute("data-practice-result"), "miss");
    assert.equal((await result.innerText()).trim(), "1 de 2 huecos bien.", "cuántos huecos están bien");
    assert(/rose/.test(await blank(1).getAttribute("class")) && /emerald/.test(await blank(2).getAttribute("class")), "cada hueco dice si está bien");
    assert(!(await board.innerText()).includes("javac"), "la respuesta no se chiva antes de tiempo");
    assert.equal(await page.locator("[data-skipped-step='aplicar']").count(), 0, "intentada, deja de figurar como saltada");
    const continueBtn = page.getByRole("button", { name: "Continuar a Fijar" });
    await continueBtn.waitFor();
    assert.equal(await page.getByRole("button", { name: "Saltar este paso" }).count(), 0, "intentado, ya no se salta");
    assert(await next.isEnabled());
    assert.equal(await page.getByText(/llévalo al mundo real|Quick win|bonus/i).count(), 0, "sin el «bonus» genérico (tarea sin verificar)");
    // Mismo «¿Cómo sigues?» que Comprobar, con la duda al lado.
    const appMoves = page.locator("[data-next-moves]");
    assert((await appMoves.innerText()).includes("Intentarlo de nuevo") && (await appMoves.innerText()).includes("Ver la solución"), "intentar de nuevo o ver la solución");
    assert.equal(await appMoves.locator("[data-doubt-trigger]").count(), 1, "la duda junto a las opciones, igual que en Comprobar");
    assert(await check.isDisabled(), "la misma respuesta no se vuelve a comprobar");
    await appMoves.locator("[data-move='improve']").click();
    assert(await blank(1).evaluate((el) => el === document.activeElement), "«Intentarlo de nuevo» lleva al primer hueco");
    // Pista: opciones para el hueco (resta bonus); elegir una rellena el hueco.
    await board.locator("[data-practice-hint]").click();
    const hint = board.locator("[data-hint-body]");
    await hint.waitFor();
    assert((await board.locator("[data-practice-hint]").innerText()).includes("usada"), "la pista queda como usada");
    await hint.getByRole("button", { name: "javac", exact: true }).first().click();
    assert.equal(await blank(1).inputValue(), "javac");
    await check.click();
    await board.locator("[data-practice-result='ok']").waitFor();
    assert((await result.innerText()).includes("Correcto. En 2 intentos.") && (await result.innerText()).includes("javac compila una vez"), "acierto con su explicación breve");
    assert(await blank(1).evaluate((el) => el.readOnly), "acertado, el intento queda cerrado");
    assert.equal(await page.locator("[data-next-moves]").count(), 0, "acertado: no se ofrece reintentar");
    await page.getByRole("button", { name: "Ver la solución explicada" }).click();
    await page.locator("[data-reference-answer]").waitFor();
    await noAiActor("Aplicar");
    const stored = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && /whatisjava/.test(k));
      return key ? JSON.parse(localStorage.getItem(key)).codeChallenge : null;
    });
    assert.deepEqual([stored?.format, stored?.attempts, stored?.hintsUsed, stored?.rating, stored?.structuredAnswer?.values], ["completar", 2, 1, "correct", ["javac", "java"]], `el historial guarda el intento estructurado: ${JSON.stringify(stored)}`);
    await page.locator("[data-doubt-trigger]").filter({ hasText: "Tengo una duda" }).first().click();
    const practice = page.locator("[data-lesson-doubt='practice']");
    await practice.waitFor();
    assert((await practice.innerText()).includes("Sobre el desafío:"));
    const jit = await ask(practice, "¿Cuándo actúa el JIT?", 0);
    assert(await jit.getByRole("button", { name: "Guardar como tarjeta" }).isDisabled(), "tope de 2 tarjetas de duda (4 ideas)");
    await jit.getByText("Ya guardaste 2 tarjetas de duda en esta lección", { exact: false }).waitFor();
    const dup = await ask(practice, "¿Y qué hace la JVM con el bytecode?", 1);
    await dup.getByText("Ya está en tu mazo", { exact: true }).waitFor();
    assert.equal(await dup.getByRole("button", { name: "Guardar como tarjeta" }).count(), 0, "sin tarjetas duplicadas (mismo GUID)");
    const setLesson = (name) => page.evaluate(async (name) => {
      const { chromeStorage } = await import("/src/app/services/chromeStorage.ts");
      await chromeStorage.set({ agent_lesson_name: name });
    }, name);
    const original = await page.evaluate(async () => {
      const { chromeStorage } = await import("/src/app/services/chromeStorage.ts");
      return String((await chromeStorage.get(["agent_lesson_name"])).agent_lesson_name || "What is Java & JVM?");
    });
    await setLesson("QA Otra lección");
    await practice.waitFor({ state: "detached" });
    assert.equal(await page.locator("[data-doubt-trigger]").count(), 0, "con otra clase abierta, sin dudas");
    // Cambiar de video no escribe en la lección equivocada: se ofrece estudiar la abierta.
    const changed = page.locator("[data-lesson-changed]");
    await changed.waitFor();
    assert((await changed.innerText()).includes("QA Otra lección"), "dice qué lección está abierta");
    await changed.getByRole("button", { name: "Estudiar esta lección" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Reiniciar/ }).count(), 0, "sin «Reiniciar» sobre la lección equivocada");
    await setLesson(original);
    await page.locator("[data-doubt-trigger]").filter({ hasText: "Tengo una duda" }).first().waitFor();
    await continueBtn.click();
  });
  console.log("PASS Aplicar: ejercicio con huecos corregido al momento (qué hueco falla, sin chivar), pista con opciones, acierto con explicación y cerrado, intento en el historial; las dos formas a la vista antes del salto, saltar y volver desde el resumen, duda anclada al desafío, tope de 2, sin duplicados, solo con la clase de la sesión");

  // ── 5. Fijar + .apkg ──────────────────────────────────────────────────────
  const SQL = await initSqlJs();
  let comprobarBefore = "";
  const readNotes = async (download) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()));
    const database = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
    const rows = database.exec("SELECT guid, flds, tags, mod FROM notes")[0]?.values ?? [];
    database.close();
    return rows.map(([guid, flds, tags, mod]) => ({ guid, fields: String(flds).split("\x1f"), tags: String(tags), mod: Number(mod) }));
  };
  // Fase 5: no hay descarga; el paquete es el que llega a Anki (AnkiConnect simulado) al terminar.
  const readImported = async (index) => {
    const base64 = await page.evaluate((i) => window.__imports[i], index);
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
    const database = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
    const rows = database.exec("SELECT guid, flds, tags, mod FROM notes")[0]?.values ?? [];
    database.close();
    return rows.map(([guid, flds, tags, mod]) => ({ guid, fields: String(flds).split("\x1f"), tags: String(tags), mod: Number(mod) }));
  };
  const connectImportAnki = async () => {
    await page.evaluate(async () => {
      const bridge = await import("/src/app/services/ankiBridge.ts");
      const { chromeLocalStorage } = await import("/src/app/services/chromeStorage.ts");
      window.__imports = window.__imports ?? [];
      await chromeLocalStorage.set({ usb_anki_connected: true });
      bridge.setAnkiTransport(async (msg) => {
        if (msg.op === "status") return { ok: true, status: { available: true, permission: "granted", version: 6 } };
        if (msg.op === "decks") return { ok: true, decks: ["Default", "Kinema"] };
        if (msg.op === "import") { window.__imports.push(msg.base64); return { ok: true, result: { before: 0, after: 5, added: 5 } }; }
        if (msg.op === "addTag") return { ok: true, tagged: 0 };
        if (msg.op === "knownWords") return { ok: true, words: [] };
        return { ok: false, error: `op ${msg.op}` };
      });
    });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "anki" } })));
    await page.locator("[data-anki-connection]").getByRole("button", { name: /Conectar|Comprobar/ }).dispatchEvent("click");
    await page.locator("[data-anki-connection]").filter({ hasText: "Conectado" }).waitFor();
    await page.getByRole("button", { name: "Cerrar configuración", exact: true }).dispatchEvent("click");
  };
  const doubtNotesOf = (notes) => notes.filter((n) => n.tags.includes("kinema::origen::duda"));
  await stage("fijar", async () => {
    await page.getByRole("button", { name: /Terminar lección/ }).waitFor();
    assert.equal(await page.locator(".kx-study").getByRole("button", { name: /Exportar|Descargar|\.apkg/ }).count(), 0, "fase 5: sin botones de exportar (Study; «Exportar EN» de Captions es otra cosa)");
    assert.equal(await page.getByText(/^Tarjetas: \d/).count(), 0, "el resumen no repite la cifra de tarjetas");
    assert.equal(await page.getByText("Fíjalo en memoria · exportar", { exact: false }).count(), 0, "sin título duplicado");
    // Destinos al mismo nivel, sin plegar; el mazo de la lección primero.
    assert.equal(await page.locator("[data-more-destinations]").count(), 0, "sin «Más destinos»");
    const yOf = async (text) => (await page.getByText(text, { exact: true }).first().boundingBox()).y;
    const [yLesson, yVocab, yObsidian] = [await yOf("Tarjetas de la lección"), await yOf("Palabras · opcional"), await yOf("Obsidian · opcional")];
    assert(yLesson < yVocab && yVocab < yObsidian, "orden: lección → palabras → Obsidian");
    // El estado de Fijar (no la píldora de Ajustes, que sigue montado aunque esté cerrado).
    await page.locator("p").filter({ hasText: /^Sin conectar$/ }).first().waitFor();
    await noAiActor("Fijar");
    // Resumen legible: filas con su resultado, sin jerga ni «apuntes».
    const summaryText = await page.locator("[data-lesson-summary]").innerText();
    assert.equal(await page.locator("[data-summary-tile]").count(), 3, "un bloque por paso");
    comprobarBefore = await page.locator("[data-summary-tile]").nth(1).innerText();
    assert(summaryText.includes("Recordar") && summaryText.includes("claras al recordar") && summaryText.includes("Comprobar") && summaryText.includes("Aplicar") && summaryText.includes("Próximo paso:"), `resumen por pasos: ${summaryText}`);
    assert(!/apuntes|marcadas por ti|mostraste|autoevaluación fue precisa|puntos a reforzar/.test(summaryText), "sin los textos confusos de antes");
    const calibrationText = await page.locator("[data-calibration]").innerText().catch(() => "");
    assert(!calibrationText || calibrationText.length < 90, `calibración corta: ${calibrationText}`);
    assert.equal(await page.evaluate(() => document.querySelector(".kx-study").scrollTop), 0, "Fijar se abre por arriba (el resumen a la vista)");
    assert.equal(await page.locator("[data-doubt-proposals]").count(), 0, "con el mazo de dudas completo no se ofrece añadir");
    assert((await page.getByText(/tarjetas · .*2 de duda/).count()) > 0, "el módulo separa las de duda");
    // Qué se convierte en tarjetas y por qué: cobertura de las ideas y origen del refuerzo.
    const whyCards = await page.locator("[data-cards-why]").innerText();
    // Cobertura garantizada: la idea 4 no traía tarjeta y se cubre con la de su pregunta.
    assert(/^4\/4 ideas cubiertas/.test(whyCards) && /prioriza refuerzo \(.*pendientes en Recordar/.test(whyCards), `Fijar explica qué va a Anki y por qué: ${whyCards}`);
    await page.getByRole("button", { name: "Ver tarjetas" }).click();
    const previewText = await page.locator("[aria-label='Ver reverso de la tarjeta'], [aria-label='Ver frente de la tarjeta']").first().innerText();
    assert(previewText.includes("Duda") && !/<\/?(p|b|blockquote|code)>/.test(previewText), "la vista previa marca la duda y no enseña HTML literal");
    await page.getByRole("button", { name: "Tarjeta siguiente" }).click();
    await page.getByRole("button", { name: "Quitar", exact: true }).click();
    const proposals = page.locator("[data-doubt-proposals]");
    await proposals.waitFor();
    assert((await proposals.innerText()).includes("1/2"), "«Quitar» libera el hueco");
    assert((await proposals.boundingBox()).y < (await page.getByRole("button", { name: /Terminar lección/ }).boundingBox()).y, "la última oportunidad está antes de terminar");
    for (const pass of [1, 2]) {
      await page.waitForTimeout(450);
      const { failures } = await contrastAudit("[data-doubt-proposals], [data-lesson-summary]");
      assert.deepEqual(failures, [], `contraste AA en Fijar (tema ${pass})`);
      await page.getByRole("button", { name: /Cambiar a tema (claro|oscuro)/ }).click();
    }
    await page.screenshot({ path: "/tmp/kinema-fijar.png" });
    await proposals.locator("div").filter({ hasText: /^¿Qué hace el JIT dentro de la JVM\?/ }).getByRole("button", { name: "Añadir al mazo" }).click();
    await proposals.waitFor({ state: "detached" });
    // Anki, conectado una vez: el paquete llegará solo al terminar (en la recarga, más abajo).
    await connectImportAnki();
    await page.locator('[data-sync="ready"]').first().waitFor();
    assert.equal(await page.evaluate(() => window.__imports.length), 0, "nada llega a Anki antes de terminar");
  });
  console.log("PASS Fijar: resumen por filas sin «apuntes», destinos al mismo nivel (lección primero), sin botones de exportar, sin títulos ni cifras duplicadas, tope respetado, «Quitar» libera el hueco, última oportunidad antes de terminar, contraste AA");

  // ── 6. Recarga y cierre ───────────────────────────────────────────────────
  await stage("recarga", async () => {
    await page.reload();
    const guest = page.getByText("Continuar sin cuenta", { exact: true });
    await guest.or(page.getByRole("button", { name: /Terminar lección/ })).first().waitFor({ timeout: 30000 });
    if (await guest.isVisible().catch(() => false)) await guest.click();
    await page.getByRole("button", { name: /Terminar lección/ }).waitFor({ timeout: 30000 });
    assert((await page.getByText(/tarjetas · .*2 de duda/).count()) > 0, "las tarjetas de duda sobreviven a la recarga");
    // «a la primera» y «corregidas» no cambian al recargar (antes volvían a 0 y lo acertado contaba como corregido).
    assert.equal(await page.locator("[data-summary-tile]").nth(1).innerText(), comprobarBefore, "el resultado de Comprobar sobrevive a la recarga");
    // Aplicar vuelve tal como quedó (acertado, cerrado, con lo que respondiste).
    await page.getByRole("button", { name: "Anterior", exact: false }).first().click();
    await page.locator("[data-structured-practice='completar'] [data-practice-result='ok']").waitFor();
    assert.equal(await page.locator("[data-structured-practice='completar']").getByRole("textbox", { name: "Hueco 1" }).inputValue(), "javac", "el tablero se restaura");
    await next.click();
    await page.getByRole("button", { name: /Terminar lección/ }).waitFor();
    // Tras recargar, la conexión con Anki se comprueba otra vez (aquí, el Anki simulado).
    await connectImportAnki();
    await page.getByRole("button", { name: /Terminar lección/ }).dispatchEvent("click");
    // La celebración del cierre sale en el MISMO sitio que los avisos (misma pila, dentro del panel).
    await page.locator("[data-sonner-toast] .kx-celebrate").first().waitFor({ timeout: 5000 });
    const celebrationSettle = await settleToast({ selector: ".kx-celebrate" });
    assert(celebrationSettle.ok, `la celebración termina de entrar: ${JSON.stringify(celebrationSettle)}`);
    const celebration = await page.evaluate(() => {
      const c = document.querySelector('[data-sonner-toast]:not([data-removed="true"]) .kx-celebrate').getBoundingClientRect();
      const d = document.querySelector(".usb-dock").getBoundingClientRect();
      return { inside: c.left >= d.left && c.right <= d.right && c.bottom <= d.bottom, low: c.top > d.top + d.height / 2, otherLayer: document.querySelectorAll(".kx-celebrate:not([data-sonner-toast] .kx-celebrate)").length };
    });
    assert.deepEqual(celebration, { inside: true, low: true, otherLayer: 0 }, `celebración en la pila de avisos del panel: ${JSON.stringify(celebration)}`);
    await page.waitForTimeout(1500);
    // «Ir a la siguiente lección», justo debajo de «Lección terminada» y a la vista (sin saltos de scroll).
    const nextLesson = page.locator("[data-next-lesson]").getByRole("button", { name: /Ir a la siguiente lección/ });
    await nextLesson.waitFor();
    assert(!/kx-cta/.test(await nextLesson.getAttribute("class")), "secundario: lo primero es que las tarjetas lleguen a Anki");
    // Al terminar, el paquete llegó solo a Anki: el mismo de siempre.
    await page.waitForFunction(() => window.__imports.length >= 1, null, { timeout: 30000 });
    const firstExport = await readImported(0);
    // Una tarjeta real por idea: la de cobertura sale de la pregunta de la idea 4 y es de refuerzo (no la sabías).
    const coverage = firstExport.find((n) => n.fields[0].includes("Windows y en Linux"));
    assert(coverage && coverage.tags.includes("kinema::reforzar"), `la idea sin tarjeta de la IA llega a Anki, como refuerzo: ${firstExport.map((n) => n.fields[0]).join(" | ")}`);
    assert(!firstExport.find((n) => n.fields[0].includes("¿Qué produce")).tags.includes("kinema::reforzar"), "lo que sabías (y se confirmó o no se preguntó) no se refuerza");
    assert(firstExport.length > 0 && firstExport.every((n) => n.mod === 1704067200), "las notas de la lección no pisan lo editado en Anki al reimportar");
    const doubtNotes = doubtNotesOf(firstExport);
    assert.equal(doubtNotes.length, 2, "dos notas de duda (la añadida en Fijar, antes de terminar)");
    for (const note of doubtNotes) {
      assert(note.tags.includes("kinema::reforzar"), "las de duda son de refuerzo");
      assert(!/&lt;|&amp;lt;/.test(note.fields[0] + note.fields[1]), "HTML sin doble escape");
      assert(note.fields[1].startsWith("<p><b>") && note.fields[1].includes("<blockquote>"), "reverso con respuesta y cita");
      assert(note.fields[3].includes("esta lección") && !/\d\d:\d\d/.test(note.fields[3]), "sin minutos inventados");
    }
    assert.equal(new Set(firstExport.map((n) => n.guid)).size, firstExport.length, "GUID únicos");
    assert.equal(await page.evaluate(() => window.__imports.length), 1, "un solo envío");
    await page.waitForTimeout(800);
    const levels = await page.evaluate(() => {
      const txt = document.querySelector(".usb-dock")?.innerText ?? "";
      return { dock: txt.match(/Nivel (\d+)/)?.[1], study: txt.match(/Nv\. (\d+)/)?.[1] };
    });
    assert(levels.dock && levels.dock === levels.study, `mismo nivel en la cabecera y en Study: ${JSON.stringify(levels)}`);
    const nb = await nextLesson.boundingBox();
    const banner = await page.getByText("Sincronizar en la nube", { exact: true }).boundingBox().catch(() => null);
    assert(nb && nb.y + nb.height <= (banner ? banner.y : page.viewportSize().height) + 2, "el botón queda a la vista al terminar");
    const doneText = await page.locator("[data-lesson-summary]").innerText();
    assert(doneText.includes("Lección terminada") && doneText.includes("Próximo paso:"), `al terminar, qué hacer después: ${doneText}`);
    const record = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("usb_history_lecture::") && JSON.parse(localStorage.getItem(k) || "{}").doubts);
      return key ? JSON.parse(localStorage.getItem(key)) : null;
    });
    assert(record && record.finishedAt, "lección terminada en el historial");
    assert.equal(record.recallNotes, "La JVM ejecuta el bytecode que genera javac.", "«Siguiente» guardó el recuerdo libre");
    assert.deepEqual([record.recallMarks, record.spotBudgetBase], [["knew", "unsure", null, null], 1], "Recordar y el presupuesto de confirmaciones quedan en el historial");
    const stored = (record.ankiCards || []).filter((c) => c.doubt);
    assert.equal(stored.length, 2, "el historial guarda las 2 tarjetas de duda");
    assert(stored.every((c) => c.isHtml), "con HTML de confianza (para «Descargar» desde el historial)");
    // Pasa de video y Study abre la lección nueva directamente (estado limpio).
    await waitNoToastOver(nextLesson);
    await nextLesson.click();
    await page.getByText("¿Para qué estudias esto?", { exact: false }).waitFor({ timeout: 15000 });
    const lesson = await page.evaluate(async () => (await (await import("/src/app/services/chromeStorage.ts")).chromeStorage.get(["agent_lesson_name"])).agent_lesson_name);
    assert.equal(lesson, "Data Types & Variables", "la siguiente lección del temario");
    assert.equal(await page.locator("[data-lesson-changed]").count(), 0, "sin tarjeta intermedia: ya está en la nueva");
  });
  console.log("PASS recarga y cierre: hilos, tarjetas y Aplicar restaurados; al terminar, el paquete llega solo a Anki (origen duda + reforzar, HTML intacto, GUID únicos, no pisa lo editado); el recuerdo libre, las marcas de Recordar y el presupuesto de confirmaciones guardados; el historial conserva las tarjetas de duda; «Ir a la siguiente lección» abre la nueva en Study");

  // ── 7. Modo invitado: el aviso de sincronización se oculta y la vuelta a iniciar sesión queda ──
  await stage("cuenta", async () => {
    const guest = page.locator("[data-guest-account]");
    await guest.getByRole("button", { name: "Iniciar sesión" }).waitFor();
    const bannerEl = page.locator("[data-sync-banner]");
    await bannerEl.waitFor();
    await bannerEl.getByRole("button", { name: "Ocultar el aviso de sincronización" }).click();
    await bannerEl.waitFor({ state: "detached" });
    await page.locator("[data-sonner-toast]").filter({ hasText: "Iniciar sesión" }).first().waitFor();
    assert.deepEqual((await contrastAudit("[data-guest-account]")).failures, [], "la cabecera de invitado cumple AA");
    await page.reload();
    const again = page.getByText("Continuar sin cuenta", { exact: true });
    await again.or(page.locator("[data-guest-account]")).first().waitFor({ timeout: 30000 });
    if (await again.isVisible().catch(() => false)) await again.click();
    await page.locator("[data-guest-account]").waitFor();
    assert.equal(await page.locator("[data-sync-banner]").count(), 0, "oculto también tras recargar");
    await page.locator("[data-guest-account]").getByRole("button", { name: "Iniciar sesión" }).click();
    await page.getByRole("heading", { name: "Inicia sesión" }).waitFor();
    await page.getByText("Continuar sin cuenta", { exact: true }).click();
    await page.locator("[data-guest-account]").waitFor();
  });
  console.log("PASS cuenta: «Sincronizar en la nube» se oculta y se recuerda; «Iniciar sesión» siempre en la cabecera y lleva al acceso; «Ir a la siguiente lección» como secundario");

  assert.deepEqual(pageErrors, [], "sin errores de ejecución");
  const relevant = consoleErrors.filter((text) => /doubt|duda|LessonDoubt|Maximum update depth|unique "key"|Cannot update a component|\[history\]/i.test(text));
  assert.deepEqual(relevant, [], "sin errores de consola de esta función");
  if (consoleErrors.length) debug("otros errores de consola:", consoleErrors.slice(0, 5));
  console.log("PASS sin errores de ejecución ni de consola");
  console.log("QA dudas: OK");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
