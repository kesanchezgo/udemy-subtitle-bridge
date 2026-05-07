"use strict";

const SIDE_PANEL_PATH = "index.html";

try {
  importScripts(chrome.runtime.getURL("src/gemini-config.local.js"));
} catch (_error) {
  // Optional during development.
}

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanelBehavior();
});

chrome.action.onClicked.addListener((tab) => {
  void openSidePanelForTab(tab);
});

const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
let preferredGeminiKeyIndex = 0;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message && message.type;
  if (type === "USG_DOWNLOAD_EN_SRT_AUTO") {
    const fileName = sanitizeFileName(String((message && message.fileName) || "udemy_en.srt"));
    const srt = String((message && message.srt) || "");
    if (!srt.trim()) {
      sendResponse({ ok: false, error: "SRT content is empty." });
      return false;
    }

    const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(srt)}`;
    chrome.downloads.download(
      {
        url: dataUrl,
        filename: `UdemySubtitleBridge/${fileName}`,
        saveAs: false,
        conflictAction: "uniquify"
      },
      (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err) {
          sendResponse({ ok: false, error: err.message || "Automatic download failed." });
          return;
        }
        sendResponse({ ok: true, downloadId: Number(downloadId) || 0 });
      }
    );

    return true;
  }

  if (type === "USG_TRANSLATE_EN_SRT_AUTO") {
    const srtText = String((message && message.srtText) || "");
    const metadata = {
      lectureKey: String((message && message.lectureKey) || ""),
      courseSlug: String((message && message.courseSlug) || ""),
      lectureId: String((message && message.lectureId) || "")
    };

    translateEnglishSrtToSpanish(srtText, metadata)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));

    return true;
  }

  if (type === "USG_GENERATE_LEARNING_PANEL") {
    const transcriptText = String((message && message.transcriptText) || "");
    const metadata = {
      lectureKey: String((message && message.lectureKey) || ""),
      courseSlug: String((message && message.courseSlug) || ""),
      lectureId: String((message && message.lectureId) || "")
    };

    generateLearningPanelFromTranscript(transcriptText, metadata)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: toErrorMessage(error) }));

    return true;
  }

  return false;
});

async function configureSidePanelBehavior() {
  if (!chrome.sidePanel || typeof chrome.sidePanel.setPanelBehavior !== "function") {
    return;
  }

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (_error) {
    // Fall back to the explicit action handler below.
  }
}

async function openSidePanelForTab(tab) {
  if (!chrome.sidePanel || !tab || typeof tab.id !== "number") {
    return;
  }

  try {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: SIDE_PANEL_PATH,
      enabled: true
    });
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.warn("[USG] Could not open side panel:", toErrorMessage(error));
  }
}

function sanitizeFileName(fileName) {
  const base = fileName.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (!base) {
    return "udemy_en.srt";
  }
  if (/\.srt$/i.test(base)) {
    return base;
  }
  return `${base}.srt`;
}

function toErrorMessage(error) {
  if (!error) {
    return "Unknown error.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

async function translateEnglishSrtToSpanish(sourceSrt, metadata) {
  const normalizedSource = String(sourceSrt || "").replace(/\r/g, "").trim();
  if (!normalizedSource) {
    throw new Error("EN SRT is empty. Translation skipped.");
  }

  const sourceBlocks = parseSrtBlocks(normalizedSource);
  if (sourceBlocks.length < 2) {
    throw new Error("EN SRT has too few valid subtitle blocks.");
  }

  const singleCallMode = Boolean(AI_SINGLE_CALL_MODE);
  const chunks = singleCallMode ? [sourceBlocks] : chunkSrtBlocks(sourceBlocks, 70, 14000);
  const translatedBlocks = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const sourceChunkSrt = formatSrtBlocks(chunk);

    let translatedChunkRaw = await requestAiReply(
      buildPrimaryTranslationPrompt(sourceChunkSrt, {
        chunkIndex: i + 1,
        chunkTotal: chunks.length,
        metadata
      })
    );

    let translatedChunkBlocks = parseSrtBlocks(extractSrtPayload(translatedChunkRaw));

    if (translatedChunkBlocks.length !== chunk.length) {
      translatedChunkRaw = await requestAiReply(
        buildRepairTranslationPrompt(sourceChunkSrt, translatedChunkRaw, {
          chunkIndex: i + 1,
          chunkTotal: chunks.length,
          expectedBlocks: chunk.length
        })
      );
      translatedChunkBlocks = parseSrtBlocks(extractSrtPayload(translatedChunkRaw));
    }

    if (translatedChunkBlocks.length !== chunk.length) {
      if (singleCallMode) {
        throw new Error(
          `AI reply did not preserve SRT blocks (${translatedChunkBlocks.length}/${chunk.length}).`
        );
      }

      const recovered = await requestChunkTranslationsAsJson(chunk, {
        chunkIndex: i + 1,
        chunkTotal: chunks.length
      });

      let finalRecovered = recovered;
      if (!finalRecovered || finalRecovered.length !== chunk.length) {
        finalRecovered = await requestChunkTranslationsOneByOne(chunk);
      }

      if (!finalRecovered || finalRecovered.length !== chunk.length) {
        throw new Error(
          `Translation chunk ${i + 1}/${chunks.length} returned ${translatedChunkBlocks.length} blocks, expected ${chunk.length}.`
        );
      }

      for (let j = 0; j < chunk.length; j += 1) {
        const original = chunk[j];
        const recoveredText = sanitizeTranslatedCueText(finalRecovered[j].text || "");
        translatedBlocks.push({
          index: original.index,
          timeLine: original.timeLine,
          text: recoveredText || original.text
        });
      }

      continue;
    }

    for (let j = 0; j < chunk.length; j += 1) {
      const original = chunk[j];
      const translated = translatedChunkBlocks[j];
      const translatedText = sanitizeTranslatedCueText(translated.text || "");
      translatedBlocks.push({
        index: original.index,
        timeLine: original.timeLine,
        text: translatedText || original.text
      });
    }
  }

  return {
    srt: `${formatSrtBlocks(translatedBlocks)}\n`,
    blockCount: translatedBlocks.length,
    chunkCount: chunks.length
  };
}

async function generateLearningPanelFromTranscript(transcriptText, metadata) {
  const cleaned = String(transcriptText || "").replace(/\r/g, "").trim();
  if (cleaned.length < 120) {
    throw new Error("Transcript is too short for learning panel generation.");
  }

  const prompt = buildLearningPanelPrompt(cleaned, metadata);
  const reply = await requestAiReply(prompt);
  const parsed = parseJsonFromReply(reply);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Learning panel response was not valid JSON.");
  }

  return {
    payload: parsed,
    raw: reply
  };
}

async function requestChunkTranslationsAsJson(chunk, options) {
  const prompt = buildJsonTranslationPrompt(chunk, options || {});
  const rawReply = await requestAiReply(prompt);
  const parsed = parseJsonFromReply(rawReply);

  let list = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.translations)) {
    list = parsed.translations;
  } else {
    return null;
  }

  if (list.length !== chunk.length) {
    return null;
  }

  const normalized = [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {};
    const expectedIndex = Number(chunk[i].index) || i + 1;
    const index = Number(row.index);
    const text = sanitizeTranslatedCueText(row.text);

    if (!text) {
      return null;
    }

    if (Number.isFinite(index) && index !== expectedIndex) {
      return null;
    }

    normalized.push({
      index: expectedIndex,
      text
    });
  }

  return normalized;
}

async function requestChunkTranslationsOneByOne(chunk) {
  const out = [];
  for (let i = 0; i < chunk.length; i += 1) {
    const block = chunk[i];
    const reply = await requestAiReply(buildSingleCueTranslationPrompt(String(block.text || "")));
    const text = sanitizeSingleCueReply(reply);
    if (!text) {
      return null;
    }
    out.push({
      index: Number(block.index) || i + 1,
      text
    });
  }
  return out;
}

function buildSingleCueTranslationPrompt(text) {
  return [
    "Traduce este texto de subtitulo de ingles a espanol tecnico para curso de software.",
    "Mantener en ingles terminos tecnicos como Spring Boot, REST API, JVM, arrays, streams, microservices, endpoints.",
    "Devuelve SOLO una linea de texto traducido, sin numeracion, sin comillas, sin explicaciones.",
    "Texto:",
    String(text || "")
  ].join("\n");
}

function sanitizeSingleCueReply(reply) {
  const raw = String(reply || "").replace(/\r/g, "").trim();
  if (!raw) {
    return "";
  }

  let text = raw;
  const fenced = raw.match(/```[a-zA-Z]*\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    text = String(fenced[1]).trim();
  }

  const line = text
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.length > 0);

  if (!line) {
    return "";
  }

  return line.replace(/^\d+[\).\-\s]+/, "").trim();
}

function buildJsonTranslationPrompt(chunk, options) {
  const chunkIndex = Number(options && options.chunkIndex) || 1;
  const chunkTotal = Number(options && options.chunkTotal) || 1;
  const input = chunk.map((item) => ({
    index: Number(item.index),
    text: String(item.text || "")
  }));

  return [
    "Traduce los textos de subtitulos de ingles a espanol tecnico para cursos de software.",
    "",
    `Chunk ${chunkIndex}/${chunkTotal}.`,
    "REGLAS:",
    "- Mantener terminos tecnicos en ingles (Spring Boot, REST API, JVM, arrays, streams, microservices, etc.).",
    "- NO cambies indices.",
    "- Devuelve SOLO JSON valido.",
    "- Formato obligatorio: [{\"index\":1,\"text\":\"...\"}]",
    "- Mismo numero de elementos que entrada.",
    "",
    "Entrada JSON:",
    JSON.stringify(input)
  ].join("\n");
}

function parseJsonFromReply(rawReply) {
  const direct = safeJsonParse(rawReply);
  if (direct) {
    return direct;
  }

  const text = String(rawReply || "").trim();
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const fromFence = safeJsonParse(fenced[1]);
    if (fromFence) {
      return fromFence;
    }
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const fromArray = safeJsonParse(text.slice(arrayStart, arrayEnd + 1));
    if (fromArray) {
      return fromArray;
    }
  }

  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    return safeJsonParse(text.slice(objStart, objEnd + 1));
  }

  return null;
}

function parseSrtBlocks(text) {
  const rawBlocks = String(text || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const blocks = [];
  for (const rawBlock of rawBlocks) {
    const lines = rawBlock.split("\n").map((line) => line.trimEnd());
    if (!lines.length) {
      continue;
    }

    let cursor = 0;
    let index = 0;
    if (/^\d+$/.test(lines[0].trim())) {
      index = Number(lines[0].trim());
      cursor = 1;
    } else {
      index = blocks.length + 1;
    }

    const timeLineRaw = String(lines[cursor] || "").trim();
    if (!isTimeLine(timeLineRaw)) {
      continue;
    }

    const textLine = lines
      .slice(cursor + 1)
      .join("\n")
      .trim();
    if (!textLine) {
      continue;
    }

    blocks.push({
      index,
      timeLine: normalizeTimeLine(timeLineRaw),
      text: textLine
    });
  }

  return blocks;
}

function isTimeLine(line) {
  return /(\d{2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{1,3})/.test(line || "");
}

function normalizeTimeLine(line) {
  return String(line || "").replace(/\s+/g, " ").replace(/\s*-->\s*/g, " --> ").trim();
}

function formatSrtBlocks(blocks) {
  return blocks
    .map((block) => {
      return [
        String(block.index),
        String(block.timeLine),
        String(block.text || "")
      ].join("\n");
    })
    .join("\n\n");
}

function chunkSrtBlocks(blocks, maxBlocksPerChunk, maxCharsPerChunk) {
  const chunks = [];
  let current = [];
  let currentChars = 0;

  for (const block of blocks) {
    const formatted = [String(block.index), block.timeLine, block.text].join("\n");
    const blockChars = formatted.length + 2;
    const wouldOverflowChars = current.length > 0 && currentChars + blockChars > maxCharsPerChunk;
    const wouldOverflowCount = current.length >= maxBlocksPerChunk;

    if (wouldOverflowChars || wouldOverflowCount) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(block);
    currentChars += blockChars;
  }

  if (current.length) {
    chunks.push(current);
  }

  return chunks;
}

function extractSrtPayload(modelReply) {
  const raw = String(modelReply || "").trim();
  if (!raw) {
    return "";
  }

  const fenced = raw.match(/```srt\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return String(fenced[1]).trim();
  }

  return raw;
}

function sanitizeTranslatedCueText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrimaryTranslationPrompt(sourceChunkSrt, options) {
  const chunkIndex = Number(options && options.chunkIndex) || 1;
  const chunkTotal = Number(options && options.chunkTotal) || 1;
  const metadata = options && options.metadata ? options.metadata : {};

  return [
    "Actua como un traductor tecnico experto especializado en desarrollo de software. Tu tarea es traducir bloques de subtitulos en formato .srt de ingles a espanol.",
    "",
    "Es CRITICO que respetes las siguientes reglas de formato y traduccion. Si rompes alguna de estas reglas, el archivo de subtitulos se corrompera y quedara inservible:",
    "",
    "1. REGLA DE SINCRONIZACION (LA MAS IMPORTANTE): Traduce estrictamente bloque por bloque. NO unas, no fusiones y no separes oraciones entre bloques, incluso si la frase original queda cortada a la mitad. El bloque traducido debe corresponder exactamente al bloque original para mantener los tiempos intactos.",
    "2. FORMATO ESTRICTO .SRT: Manten la estructura exacta de tres lineas por bloque:",
    "   - Linea 1: El numero de secuencia.",
    "   - Linea 2: La marca de tiempo exacta.",
    "   - Linea 3: El texto traducido.",
    "   - Deja exactamente UNA linea en blanco entre cada bloque.",
    "3. CERO ETIQUETAS: NO incluyas etiquetas de sistema, metadatos, comentarios, saludos ni bloques markdown. Devuelve UNICAMENTE texto .srt crudo.",
    "4. JERGA TECNICA INTACTA: Mantener en ingles terminos tecnicos, tecnologias, frameworks y arquitectura. Ejemplos: Spring Boot, Spring Cloud, microservices, JPA, REST API, endpoints, JVM, multi-threading, exceptions, arrays, streams.",
    "5. INMUTABLE: No cambies ni una sola cifra de la linea 1 o 2 de cada bloque. Solo traduce la linea 3.",
    "6. CONSISTENCIA: Mismo numero total de bloques de entrada y salida para este chunk.",
    "",
    `Contexto chunk: ${chunkIndex}/${chunkTotal}`,
    `Metadata: course=${metadata.courseSlug || ""}, lecture=${metadata.lectureId || ""}, key=${metadata.lectureKey || ""}`,
    "",
    "Aqui esta el texto a traducir:",
    "",
    sourceChunkSrt
  ].join("\n");
}

function buildLearningPanelPrompt(transcriptText, metadata) {
  const safeTranscript = String(transcriptText || "").trim();

  return [
    "Eres un experto en pedagogia y en el tema de la clase.",
    "Transcripcion de la clase:",
    safeTranscript,
    "",
    "Genera una respuesta JSON con esta estructura:",
    "{",
    "  \"resumen\": {",
    "    \"puntos_clave\": [\"punto1\", \"punto2\"],",
    "    \"explicacion\": \"Explicacion clara y simplificada en 3-5 parrafos\",",
    "    \"conceptos_complementarios\": [\"concepto1 con explicacion breve\"]",
    "  },",
    "  \"cuestionario\": [",
    "    {",
    "      \"pregunta\": \"...\",",
    "      \"opciones\": [\"a) ...\", \"b) ...\", \"c) ...\", \"d) ...\"],",
    "      \"respuesta_correcta\": \"a\",",
    "      \"explicacion\": \"Por que es correcta...\"",
    "    }",
    "  ],",
    "  \"code_task\": {",
    "    \"titulo\": \"...\",",
    "    \"descripcion\": \"...\",",
    "    \"codigo_base\": \"// codigo inicial si aplica\",",
    "    \"solucion\": \"// solucion esperada\",",
    "    \"aplica\": true",
    "  }",
    "}",
    "",
    "Reglas:",
    "- Devuelve SOLO JSON valido (sin markdown ni comentarios).",
    "- Si no es clase tecnica, \"code_task.aplica\" debe ser false.",
    "- Escribe todo en espanol claro.",
    "",
    `Metadata: course=${metadata.courseSlug || ""}, lecture=${metadata.lectureId || ""}, key=${metadata.lectureKey || ""}`
  ].join("\n");
}

function buildRepairTranslationPrompt(sourceChunkSrt, previousReply, options) {
  const chunkIndex = Number(options && options.chunkIndex) || 1;
  const chunkTotal = Number(options && options.chunkTotal) || 1;
  const expectedBlocks = Number(options && options.expectedBlocks) || 0;

  return [
    "Repara la traduccion SRT. Tu salida anterior rompio el formato.",
    `Chunk ${chunkIndex}/${chunkTotal}. Debes devolver exactamente ${expectedBlocks} bloques SRT validos.`,
    "No cambies linea 1 ni linea 2 de ningun bloque. Solo traduce linea 3.",
    "No agregues comentarios, markdown ni encabezados.",
    "",
    "SRT original (fuente):",
    sourceChunkSrt,
    "",
    "Salida anterior defectuosa (solo referencia):",
    String(previousReply || "").slice(0, 9000)
  ].join("\n\n");
}

async function requestAiReply(prompt) {
  try {
    return await requestGeminiText(prompt, {
      temperature: 0.2,
      maxOutputTokens: 4096
    });
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
}

async function requestGeminiText(prompt, options) {
  const keys = getGeminiApiKeys();
  if (!keys.length) {
    throw new Error("No Gemini API keys configured.");
  }

  const model = getGeminiModel();
  const startIndex = Math.min(preferredGeminiKeyIndex, Math.max(keys.length - 1, 0));
  const orderedKeys = keys.slice(startIndex).concat(keys.slice(0, startIndex));

  let lastError = null;

  for (let i = 0; i < orderedKeys.length; i += 1) {
    const apiKey = orderedKeys[i];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: String(prompt || "") }]
            }
          ],
          generationConfig: {
            temperature: Number(options && options.temperature) || 0.2,
            maxOutputTokens: Number(options && options.maxOutputTokens) || 4096
          }
        })
      });

      const text = await response.text();
      const parsed = safeJsonParse(text);
      if (!response.ok) {
        const detail = parsed && parsed.error && parsed.error.message
          ? String(parsed.error.message)
          : String(text || "Gemini request failed").slice(0, 260);
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }

      const reply = extractGeminiText(parsed);
      if (!reply) {
        throw new Error("Gemini returned an empty reply.");
      }

      preferredGeminiKeyIndex = i;
      return reply;
    } catch (error) {
      lastError = new Error(toErrorMessage(error));
    }
  }

  throw lastError || new Error("Could not connect to Gemini API.");
}

function getGeminiApiKeys() {
  const keys = Array.isArray(globalThis.USB_GEMINI_API_KEYS)
    ? globalThis.USB_GEMINI_API_KEYS
    : [];
  return keys
    .map((key) => String(key || "").trim())
    .filter(Boolean);
}

function getGeminiModel() {
  const model = String(globalThis.USB_GEMINI_MODEL || GEMINI_DEFAULT_MODEL).trim();
  return model || GEMINI_DEFAULT_MODEL;
}

function extractGeminiText(payload) {
  const parts = payload
    && Array.isArray(payload.candidates)
    && payload.candidates[0]
    && payload.candidates[0].content
    && Array.isArray(payload.candidates[0].content.parts)
    ? payload.candidates[0].content.parts
    : [];

  return parts
    .map((part) => String(part && part.text ? part.text : ""))
    .join("")
    .trim();
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}
