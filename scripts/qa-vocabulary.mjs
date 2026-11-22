import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
import JSZip from "jszip";
import initSqlJs from "sql.js";

const port = 4187;
const url = `http://127.0.0.1:${port}`;
// La vista previa de Figma Make carga src/styles/ (vía __figma__entrypoint__.ts);
// la extensión carga src/app/styles/. Si divergen, el prototipo deja de verse
// como el proyecto (pasó: fonts.css vacío → sin Plus Jakarta Sans en el login).
for (const file of ["index.css", "fonts.css", "theme.css", "tailwind.css"]) {
  assert.equal(fs.readFileSync(`src/styles/${file}`, "utf8"), fs.readFileSync(`src/app/styles/${file}`, "utf8"), `src/styles/${file} debe ser idéntico a src/app/styles/${file} (estilos del repo)`);
}
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "pipe" });
let browser;
const payload = { words: [
  { word: "virtual machine", level: "C1", pos: "noun", meaning: "máquina virtual", phonetic: "/ˌvɜːtʃuəl məˈʃiːn/", monolingual: "Software that simulates a computer.", sentence: "A virtual machine executes bytecode.", sentenceTranslation: "Una máquina virtual ejecuta bytecode." },
  { word: "object-oriented", level: "B2", pos: "adjective", meaning: "orientado a objetos", phonetic: "/ˌɒbdʒekt ˈɔːrientɪd/", monolingual: "Organized around objects.", sentence: "Java is object-oriented.", sentenceTranslation: "Java está orientado a objetos." },
] };

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(ready, "Vite did not start");
  // El main.tsx sustituto (route más abajo) importa directamente las rutas de
  // .vite/deps, que Vite nunca ve: en frío (o tras re-optimizar al cambiar
  // archivos) aún no existen, react-dom_client.js da 404 y la app no monta.
  // Pedir el main real dispara la optimización; se espera a que existan.
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
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, acceptDownloads: true });
  await page.route("**/src/main.tsx", route => route.fulfill({ contentType: "application/javascript", body: 'import React from "/node_modules/.vite/deps/react.js"; import ReactDOM from "/node_modules/.vite/deps/react-dom_client.js"; import App from "/src/app/App.tsx"; import "/src/styles/index.css"; ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));' }));
  const pageErrors = [];
  page.on("pageerror", error => { pageErrors.push(error.message); if (process.env.QA_DEBUG) console.log("PAGEERROR", error.message); });
  await page.goto(url);
  await page.getByText("Continuar sin cuenta", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Abrir configuración", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar configuración", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cerrar configuración", exact: true }).click();
  await page.getByText("Continuar sin cuenta", { exact: true }).click();
  const panel = page.locator("[data-vocabulary-preferences]");
  const openPreferences = async () => { await page.getByRole("button", { name: "Abrir configuración", exact: true }).click(); { const vocab = page.getByRole("button", { name: /^Idiomas/ }); if ((await vocab.getAttribute("aria-expanded")) !== "true") await vocab.click(); } await panel.getByLabel("Idioma objetivo del vocabulario").waitFor(); const summary = panel.locator("summary"); if (!(await panel.getByRole("checkbox").count())) await summary.click(); };
  assert.equal(await page.getByText("Tu memoria", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Configurar vocabulario de apoyo" }).count(), 0);
  assert.equal(await page.getByRole("dialog", { name: "Vocabulario de apoyo" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /Ver demo|Probar demo|Salir de demo|Probar texto largo/ }).count(), 0);
  await page.getByRole("button", { name: "Marcar para Anki", exact: true }).and(page.locator("button:enabled")).waitFor();
  await page.waitForTimeout(500);
  const initialSubtitle = await page.locator("[data-subtitle-anchor]").boundingBox();
  const initialChip = await page.locator("[data-prototype-video] [data-vocabulary-chip]").boundingBox();
  assert(initialSubtitle && initialChip && initialChip.y >= initialSubtitle.y + initialSubtitle.height + 8, "paused chip is below the subtitle, not over it");
  await page.screenshot({ path: "/tmp/kinema-study-clean.png", fullPage: true });
  await page.getByRole("button", { name: "Marcar para Anki", exact: true }).and(page.locator("button:enabled")).click();
  const subtitleBefore = await page.locator("[data-subtitle-anchor]").boundingBox();
  await openPreferences();
  await panel.getByLabel("Idioma objetivo del vocabulario").waitFor();

  await page.waitForTimeout(500);
  assert.equal(await panel.locator("section").count(), 1, "preferences reuse the shared export module, not a new modal");
  assert.equal(await page.getByRole("region", { name: "Configuración de Kinema", exact: true }).count(), 1);
  await page.screenshot({ path: "/tmp/kinema-vocabulary-preferences.png", fullPage: true });
  assert(await panel.getByRole("checkbox", { name: "Seleccionar object-oriented", exact: true }).isChecked(), "video and panel share selection");
  await page.getByRole("button", { name: "Cerrar configuración", exact: true }).click();
  await page.reload();
  await openPreferences();
  assert(await panel.getByRole("checkbox", { name: "Seleccionar object-oriented", exact: true }).isChecked(), "selection survives reload");
  await panel.getByRole("checkbox", { name: "Seleccionar object-oriented", exact: true }).uncheck();
  console.log("PASS automatic prototype fixtures, no demo controls, persisted selection");

  await page.evaluate(payload => {
    window.qaAiCalls = 0;
    window.chrome = { runtime: { sendMessage(message, callback) {
      if (message.type === "USG_GET_STUDY_TRANSCRIPT") callback({ ok: true, transcriptText: "Java is object-oriented. A virtual machine executes bytecode." });
      else if (message.type === "USG_GENERATE_VOCABULARY") { window.qaAiCalls++; callback({ ok: true, payload }); }
      else callback({ ok: false });
    } } };
  }, payload);
  await panel.getByRole("button", { name: "Volver a proponer palabras" }).click();
  await panel.getByRole("checkbox", { name: "Seleccionar virtual machine", exact: true }).check();
  await page.keyboard.press("Alt+p");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("usb_to_sidebar", { detail: { type: "SUBTITLE_LINE_RECEIVED", payload: { en: "A virtual machine executes bytecode.", ts: Date.now() } } })));
  await page.getByRole("button", { name: "Cerrar configuración", exact: true }).click();
  await page.getByText("Overlay", { exact: true }).click();
  const switchControl = page.getByRole("switch", { name: "Mostrar vocabulario de apoyo" });
  await switchControl.uncheck();
  await page.waitForTimeout(500);
  const withoutChip = await page.locator("[data-subtitle-anchor]").boundingBox();
  await switchControl.check();
  await page.waitForTimeout(500);
  const withChip = await page.locator("[data-subtitle-anchor]").boundingBox();
  assert(withoutChip && withChip && Math.abs(withoutChip.y - withChip.y) < 1, "chip toggle does not move subtitle");
  await page.getByRole("button", { name: "Pausar vista previa" }).click();

  await page.locator("[data-vocabulary-chip]").first().waitFor();
  const monitor = page.locator(".usb-video-surface");
  const monitorBox = await monitor.boundingBox();
  const grip = page.getByTitle("Arrastra para posición libre", { exact: true });
  const gripBox = await grip.boundingBox();
  assert(monitorBox && gripBox && subtitleBefore);
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(monitorBox.x + monitorBox.width - 2, monitorBox.y + monitorBox.height - 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const chipBox = await monitor.locator("[data-vocabulary-chip]").boundingBox();
  console.log("Preview boundary measurement", { monitorBox, chipBox });
  await page.screenshot({ path: "/tmp/kinema-vocabulary-preview.png", fullPage: true });
  assert(chipBox && chipBox.x >= monitorBox.x - 1 && chipBox.x + chipBox.width <= monitorBox.x + monitorBox.width + 1 && chipBox.y + chipBox.height <= monitorBox.y + monitorBox.height + 1, "dragged chip stays inside preview");
  {
    // Bajar al fondo y volver a subir: sin zona muerta ni bloqueo.
    const freeGrip = monitor.getByTitle("Arrastra para mover", { exact: true });
    const subLow = await freeGrip.locator("..").boundingBox();
    const g = await freeGrip.boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, monitorBox.y + monitorBox.height + 80, { steps: 6 });
    await page.mouse.move(g.x + g.width / 2, monitorBox.y + 20, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const subHigh = await freeGrip.locator("..").boundingBox();
    assert(subLow && subHigh && subHigh.y < subLow.y - 60, "free position drags back up without locking");
  }
  const actualVideo = await page.locator("[data-prototype-video]").boundingBox();
  // El video principal sigue avanzando: AnimatePresence (mode="wait") desmonta
  // el subtítulo entre líneas; esperar a que exista evita una medición nula.
  // Entre waitFor y boundingBox el subtítulo puede desmontarse (cambio de
  // línea): se reintenta la medición hasta obtener una caja real.
  let actualSubtitle = null;
  for (let attempt = 0; attempt < 30 && !actualSubtitle; attempt++) {
    await page.locator("[data-subtitle-anchor]").first().waitFor({ state: "visible" }).catch(() => {});
    actualSubtitle = await page.locator("[data-subtitle-anchor]").first().boundingBox().catch(() => null);
    if (!actualSubtitle) await page.waitForTimeout(100);
  }
  assert(actualVideo && actualSubtitle && actualSubtitle.x >= actualVideo.x && actualSubtitle.x + actualSubtitle.width <= actualVideo.x + actualVideo.width, `dragged subtitle stays within the actual video too ${JSON.stringify({ actualVideo, actualSubtitle })}`);
  await openPreferences();
  await panel.getByLabel("Máximo palabras nuevas").fill("3");
  const levels = panel.getByRole("radiogroup", { name: "Nivel mínimo de vocabulario" });
  const previousLevel = (await levels.getByRole("radio", { name: "B2", exact: true }).getAttribute("aria-checked")) === "true" ? "B2" : "B1";
  await levels.getByRole("radio", { name: previousLevel === "B2" ? "B1" : "B2", exact: true }).click();
  await panel.getByText("Configuración modificada.", { exact: false }).waitFor();
  // Fase 5: Ajustes → Idiomas no exporta nada (ni botones de exportar ni de descargar): lo marcado llega a Anki al terminar.
  assert.equal(await panel.getByRole("button", { name: /Exportar|Descargar|Enviar/ }).count(), 0, "Idiomas: sin botones de exportar");
  await panel.getByRole("button", { name: "Aplicar cambios a la lista" }).click();
  await panel.getByRole("checkbox", { name: "Seleccionar virtual machine", exact: true }).waitFor();
  // Anki simulado: lo que llega es el mismo .apkg de siempre (note type, GUID por lema), importado con AnkiConnect.
  await page.evaluate(async () => {
    const bridge = await import("/src/app/services/ankiBridge.ts");
    window.__imports = [];
    bridge.setAnkiTransport(async (msg) => {
      if (msg.op === "import") { window.__imports.push(msg.base64); return { ok: true, result: { before: 0, after: 1, added: 1 } }; }
      if (msg.op === "status") return { ok: true, status: { available: true, permission: "granted", version: 6 } };
      return { ok: false, error: `op ${msg.op}` };
    });
  });
  const sendSelection = () => page.evaluate(async () => {
    const sync = await import("/src/app/services/vocabularySync.ts");
    // Las sesiones viven en chrome.storage.local (en la vista previa, localStorage con prefijo).
    const stored = Object.keys(localStorage).filter((k) => k.includes("usb_vocab_session_")).map((k) => [k.slice(k.indexOf("usb_vocab_session_")), JSON.parse(localStorage.getItem(k))]);
    const found = stored.find(([, v]) => v && !v.demo && v.selected?.length);
    return found ? sync.sendVocabularySelection(found[0], { lessonUrl: "https://www.udemy.com/course/java/learn/lecture/1" }) : `sin sesión: ${stored.map(([k, v]) => `${k} demo=${v?.demo} sel=${v?.selected?.length}`).join(" | ")}`;
  });
  const SQL = await initSqlJs();
  const readImported = async (index) => {
    const base64 = await page.evaluate((i) => window.__imports[i], index);
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
    const collection = zip.file("collection.anki2");
    assert(collection, "APKG contains collection.anki2");
    const database = new SQL.Database(await collection.async("uint8array"));
    const notes = database.exec("SELECT guid, flds, tags FROM notes ORDER BY guid");
    database.close();
    return notes[0]?.values ?? [];
  };
  const before = await page.evaluate(() => window.qaAiCalls);
  const first = await sendSelection();
  assert.equal(first?.words, 1, `una palabra enviada: ${JSON.stringify(first)}`);
  const originalNotes = await readImported(0);
  assert.equal(originalNotes.length, 1, "only the selected word is sent");
  assert(originalNotes[0][1].startsWith("virtual machine"));
  assert(/(^|\s)kinema::plataforma::udemy(\s|$)/.test(originalNotes[0][2]) && !originalNotes[0][2].includes("kinema/platform"), `etiquetas de ahora: ${originalNotes[0][2]}`);
  assert.equal(await sendSelection(), null, "lo ya enviado no se vuelve a enviar");
  assert.equal(await page.evaluate(() => window.__imports.length), 1);
  assert.equal(await page.evaluate(() => window.qaAiCalls), before, "enviar no genera");
  await panel.getByRole("checkbox", { name: "Seleccionar virtual machine", exact: true }).and(page.locator(":disabled")).waitFor();
  assert(await panel.getByRole("checkbox", { name: "Seleccionar virtual machine", exact: true }).isDisabled(), "exported word cannot duplicate");
  await panel.getByRole("checkbox", { name: "Seleccionar object-oriented", exact: true }).check();
  const second = await sendSelection();
  assert.equal(second?.words, 1);
  const secondNotes = await readImported(1);
  assert.equal(secondNotes.length, 1);
  assert(secondNotes[0][1].startsWith("object-oriented"));
  assert.notEqual(secondNotes[0][0], originalNotes[0][0], "una nota por palabra (GUID por lema)");
  assert.equal(await page.evaluate(() => window.qaAiCalls), before);
  const readNotes = async (downloaded) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(await downloaded.path()));
    const database = new SQL.Database(await zip.file("collection.anki2").async("uint8array"));
    const notes = database.exec("SELECT guid, flds FROM notes ORDER BY guid");
    database.close();
    return notes[0]?.values ?? [];
  };
  console.log("PASS candidate generation, config invalidation, sin botones de exportar, envío a Anki del mismo APKG (etiquetas de ahora), deduplication, nada se reenvía");

  const rules = await page.evaluate(async () => {
    const service = await import("/src/app/services/vocabularySession.ts");
    const vocab = await import("/src/app/services/vocabularyService.ts");
    const config = { ...vocab.DEFAULT_VOCAB_CONFIG, maxWords: 3, rootDeck: "QA Custom" };
    const candidates = Array.from({ length: 5 }, (_, index) => ({ word: `word${index}`, level: "B2", sentence: "Example.", sentenceTranslation: "Ejemplo.", meaning: "ejemplo", phonetic: "", monolingual: "", pos: "noun" }));
    let session = { course: "QA", lesson: "QA", config, candidates, selected: [], demo: false, exports: [] };
    for (const word of candidates.slice(0, 3)) session = service.toggleVocabularySelection(session, word.word, new Set());
    let limit = false;
    try { service.toggleVocabularySelection(session, candidates[3].word, new Set()); } catch { limit = true; }
    let duplicate = false;
    try { service.toggleVocabularySelection(session, candidates[3].word, new Set([candidates[3].word])); } catch { duplicate = true; }
    const spec = vocab.buildVocabularySpec(candidates.slice(0, 1), "QA", "QA", config);
    const seen = await service.exportedVocabularyKeys("en");
    const realCrossLesson = seen.has("virtual machine");
    const prompts = await import("/src/shared/prompts.ts");
    const t = (n) => "word ".repeat(n);
    return {
      limit, duplicate, realCrossLesson, selected: session.selected.length, deck: spec.deckPath,
      // Lema + flexiones regulares, nunca subcadenas; las irregulares por la forma vista.
      inflected: service.vocabularyMatches("machine", "machines") && service.vocabularyMatches("figure out", "we figured it out"),
      substring: service.vocabularyMatches("machine", "machinery") || service.vocabularyMatches("art", "the artist"),
      irregular: service.vocabularyMatches("run", "he ran", "ran") && !service.vocabularyMatches("run", "he ran"),
      phrase: service.vocabularyMatches("virtual machine", "A virtual machine runs."),
      // Candidatas según el volumen de la lección (×5 caracteres: corta, breve, normal, densa).
      targets: [400, 1000, 2000, 4000].map((n) => prompts.vocabularyCandidateTarget(t(n))),
      // Un solo número para el estudiante: nunca más que su máximo por lección.
      capped: [400, 4000].map((n) => prompts.vocabularyCandidateTarget(t(n), 8)),
      // Las que ya tienes y salen en la lección: fuera de la lista, pero para el chip (repaso en contexto).
      knownHere: (await service.knownVocabularyIn("en", "Every virtual machine runs bytecode.")).map((k) => k.word),
      // Lo que ya está en tu mazo no se vuelve a pedir.
      knownInPrompt: prompts.buildVocabularyPrompt(t(400), { course: "QA", lesson: "QA", targetLang: "English", baseLang: "español", minLevel: "B1", maxWords: 6, knownWords: ["leak", "throughput"] }).includes("YA ESTÁN EN SU MAZO (de otras lecciones o cursos): NO las propongas: leak, throughput."),
      // Reimportar una palabra nunca pisa imagen/audio/ediciones: fecha de modificación vieja y fija.
      oldMod: spec.spec.notes.every((note) => note.mod === vocab.VOCAB_NOTE_MOD),
      // Plantillas de Anki: misma regla (flexiones y límites de palabra), no subcadenas.
      template: await (async () => {
        const design = await import("/src/app/services/ankiDesign.ts");
        const kx = new Function(`${design.VOCAB_WORD_REGEX_JS}; return kxWordRegex;`)();
        const marks = (w, text) => { const re = kx(w); const out = []; let m; while ((m = re.exec(text)) !== null) { if (!m[2]) { re.lastIndex += 1; continue; } out.push(m[2]); } return out; };
        return [marks("leak", "Memory leaks slow it."), marks("art", "She started the art class."), marks("figure out", "We figured it out."), marks("C++", "C++ rocks.")];
      })(),
    };
  });
  assert(rules.knownInPrompt, "las palabras que ya tienes no se vuelven a proponer");
  assert(rules.knownHere.includes("virtual machine"), `las que ya tienes en esta lección se reconocen (chip): ${JSON.stringify(rules.knownHere)}`);
  assert(rules.oldMod, "las notas de vocabulario no pisan lo que ya está en Anki al reimportar");
  assert.deepEqual(rules.template, [["leaks"], ["art"], ["figured it out"], ["C++"]], `resaltado/hueco en la tarjeta: ${JSON.stringify(rules.template)}`);
  assert(rules.limit && rules.duplicate && rules.realCrossLesson && rules.phrase && rules.inflected && !rules.substring && rules.irregular, `coincidencias: ${JSON.stringify(rules)}`);
  assert.deepEqual(rules.targets, [6, 10, 15, 20], "candidatas según la longitud de la lección");
  assert.deepEqual(rules.capped, [6, 8], "propone hasta tu máximo por lección (menos si la lección es corta)");
  assert.equal(rules.selected, 3);
  assert(rules.deck.startsWith("QA Custom::"));
  console.log("PASS selection cap, cross-lesson exported registry, known words excluded from the prompt, lemma + inflection + seen-form matching (panel, video and Anki templates), candidates by lesson length, reimport never overwrites, custom root");

  const themeButton = page.getByRole("button", { name: /Cambiar a tema (claro|oscuro)/ });
  const initialThemeLabel = await themeButton.getAttribute("aria-label");
  await page.getByRole("button", { name: "Cerrar configuración", exact: true }).click();
  await themeButton.click();
  await openPreferences();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/kinema-vocabulary-preferences-dark.png", fullPage: true });
  await page.evaluate(() => {
    const send = window.chrome.runtime.sendMessage;
    window.chrome.runtime.sendMessage = (message, callback) => {
      if (message.type === "USG_GENERATE_VOCABULARY") window.qaDelayedResponse = callback;
      else send(message, callback);
    };
  });
  await panel.getByRole("button", { name: "Volver a proponer palabras" }).click();
  await page.waitForFunction(() => typeof window.qaDelayedResponse === "function");
  await page.evaluate(async payload => {
    const { chromeStorage } = await import("/src/app/services/chromeStorage.ts");
    await chromeStorage.set({ agent_lesson_name: "QA New Lesson" });
    await new Promise(resolve => setTimeout(resolve, 200));
    window.qaDelayedResponse({ ok: true, payload });
  }, payload);
  await panel.getByRole("button", { name: "Proponer palabras" }).waitFor();
  assert.equal(await panel.getByRole("checkbox").count(), 0, "old generation must not populate new lesson");
  console.log("PASS video-panel selection, one export notification, late response discarded after lesson change");
  await page.waitForTimeout(300);
  assert.notEqual(await themeButton.getAttribute("aria-label"), initialThemeLabel);
  await page.getByRole("button", { name: "Cerrar configuración", exact: true }).click();
  await themeButton.click();
  await page.evaluate(() => {
    const record = { courseId: "qa-pending", lectureId: "concepts", courseName: "QA Content", lectureName: "JVM concepts", startedAt: Date.now(), updatedAt: Date.now(), status: "completed", questions: [], ankiCardsCount: 1, ankiCards: [{ id: "qa-concept", front: "What does the JVM execute?", back: "Bytecode.", type: "concept", tags: [] }] };
    localStorage.setItem("usb_history_lecture::qa-pending::concepts", JSON.stringify(record));
  });
  // Sin AnkiConnect: la Biblioteca dice qué falta y deja el respaldo (.apkg) a mano.
  await page.evaluate(async () => { (await import("/src/app/services/ankiBridge.ts")).setAnkiTransport(null); });
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByText("Aún no están en Anki", { exact: true }).waitFor();
  assert.match(await page.locator("[data-pending-anki]").innerText(), /JVM concepts/);
  assert.equal(await page.locator("[data-pending-send]").count(), 0, "sin Anki conectado no se ofrece enviar");
  const contentDownload = page.waitForEvent("download");
  await page.locator("[data-pending-download]").click();
  const contentNotes = await readNotes(await contentDownload);
  assert.equal(contentNotes.length, 1);
  assert(contentNotes[0][1].includes("What does the JVM execute?"));
  await page.getByText("Archivos descargados", { exact: true }).waitFor();
  assert.equal(await page.getByText("Aún no están en Anki", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).click();
  console.log("PASS lo que aún no está en Anki, en la Biblioteca (con el respaldo .apkg sin AnkiConnect), no memory dashboard in Study");
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) { if (key.startsWith("usb_history_lecture::")) localStorage.removeItem(key); } for (let index = 0; index < 100; index++) { const record = { courseId: `qa-course-${index}`, lectureId: "lesson", courseName: `QA Course ${index}`, lectureName: "QA Lesson", startedAt: Date.now(), updatedAt: Date.now(), exportedAt: Date.now(), status: "completed", questions: [], ankiCardsCount: 3 }; localStorage.setItem(`usb_history_lecture::${record.courseId}::lesson`, JSON.stringify(record)); } });
  await page.reload();
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  assert.equal(await page.getByText("con AnkiConnect, Kinema te muestra aquí los pendientes", { exact: false }).count(), 1, "unknown Anki state is explicit, not zero pending");
  assert.equal(await page.getByText("Sin repasos pendientes hoy", { exact: false }).count(), 0, "without AnkiConnect it never claims zero pending");
  assert.equal(await page.getByRole("button", { name: /Abrir Anki|Repasar en Anki/ }).count(), 0, "no fake «open Anki» action when Anki does not answer");
  const coursesList = page.getByRole("region", { name: "Cursos estudiados" });
  await coursesList.waitFor();
  assert.equal(await coursesList.getByRole("button", { name: /^Eliminar QA Course/ }).count(), 100, "all 100 courses listed once");
  assert.equal(await page.getByText("Tarjetas por curso y lección").count(), 0, "no duplicate per-course Anki list");
  // Biblioteca sin Anki: el curso abierto muestra lo del historial y no finge cifras de Anki.
  await coursesList.locator('[data-library-course-toggle="qa-course-7"]').click();
  const offline = page.locator('[data-library-course="qa-course-7"]');
  await offline.waitFor();
  assert((await offline.locator("[data-library-anki]").innerText()).includes("Cifras de tu historial"), "without Anki the course says its numbers come from history");
  assert.equal(await offline.locator("[data-anki-count]").count(), 0, "no Anki totals/new/due without Anki");
  assert.equal(await offline.getByRole("button", { name: /Abrir en Anki|Repasar hoy|Ver en Anki/ }).count(), 0, "no Anki actions without Anki");
  assert.match((await offline.locator("[data-library-stats] > .grid").innerText()).replace(/\s+/g, " "), /^3 Tarjetas 0 Refuerzo 0 Dudas 3 En Anki$/, "history numbers for the course");
  assert.deepEqual(pageErrors, [], "no browser runtime errors");
  await page.getByRole("button", { name: "Cerrar biblioteca", exact: true }).click();
  const gear = page.getByRole("button", { name: "Abrir configuración", exact: true });
  await gear.click({ clickCount: 3, delay: 80 });
  await page.getByText("Dev · Debug Panel", { exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Configuración de Kinema", exact: true }).count(), 0, "triple click opens Dev, not settings");
  await gear.click();
  await page.getByRole("region", { name: "Configuración de Kinema", exact: true }).waitFor();
  await page.getByText("Proveedor de IA", { exact: true }).click();
  await page.locator("[data-ai-connection]").waitFor();
  await page.getByText("Servidor", { exact: true }).waitFor();
  assert.equal(await page.getByRole("radiogroup", { name: "Motor principal" }).getByRole("radio").count(), 4, "un motor: local, OpenAI, Claude o Gemini");
  assert.equal(await page.getByText("Llaves Gemini", { exact: true }).count(), 0, "no multi-key Gemini rotation UI");
  await page.getByRole("button", { name: "Cerrar configuración", exact: true }).click();
  console.log("PASS single-click settings, triple-click Dev, unified AI preferences and chip-subtitle separation");
  console.log("PASS both themes, 100-course bounded history, no browser runtime errors");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
