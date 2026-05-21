// ─── Local AI Service ────────────────────────────────────────────────────────
// Connects to the local AI server at 127.0.0.1:8010 (OpenAI-compatible API)
// Used by Study Agent for real-time student response evaluation
import { debugStore } from "./debugStore";
import {
  buildGeminiGenerateContentUrl,
  buildGeminiStreamContentUrl,
  initGeminiKeys,
  normalizeGeminiKeys,
} from "../../gemini-config";

const LOCAL_AI_URL = "http://127.0.0.1:8010";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const LOCAL_AI_RETRY_AFTER_MS = 45_000;

let localAiRetryAfter = 0;

type GeminiGlobal = typeof globalThis & {
  USB_GEMINI_API_KEYS?: string[];
  USB_GEMINI_MODEL?: string;
};

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIRating = "correct" | "excellent" | "partial" | "wrong" | "unknown";

export interface AIResponse {
  success: boolean;
  content: string;
  rating: AIRating;
  error?: string;
  isMock?: boolean;
}

function getGeminiApiKeys(): string[] {
  const g = globalThis as GeminiGlobal;
  return Array.isArray(g.USB_GEMINI_API_KEYS)
    ? normalizeGeminiKeys(g.USB_GEMINI_API_KEYS)
    : [];
}

function getGeminiModel(): string {
  const g = globalThis as GeminiGlobal;
  return String(g.USB_GEMINI_MODEL || GEMINI_DEFAULT_MODEL).trim() || GEMINI_DEFAULT_MODEL;
}

async function ensureGeminiKeysLoaded(): Promise<string[]> {
  if (getGeminiApiKeys().length > 0) return getGeminiApiKeys();
  await initGeminiKeys().catch(() => undefined);
  return getGeminiApiKeys();
}

function buildGeminiPayload(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
): Record<string, unknown> {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  if (!contents.length) {
    contents.push({ role: "user", parts: [{ text: systemText || "Responde en espanol." }] });
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemText) {
    payload.systemInstruction = { parts: [{ text: systemText }] };
  }

  return payload;
}

function extractGeminiText(data: unknown): string {
  const parts = (data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  })?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function callGeminiAI(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
): Promise<AIResponse | null> {
  const apiKeys = await ensureGeminiKeysLoaded();
  if (!apiKeys.length) return null;

  const model = getGeminiModel();
  let lastError = "";

  for (const apiKey of apiKeys) {
    try {
      const res = await fetch(buildGeminiGenerateContentUrl(model, apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGeminiPayload(messages, maxTokens, temperature)),
      });

      const responseText = await res.text();
      if (!res.ok) {
        lastError = `Gemini HTTP ${res.status}: ${responseText.slice(0, 220)}`;
        continue;
      }

      const content = extractGeminiText(JSON.parse(responseText));
      if (content) {
        return { success: true, content, rating: parseRating(content) };
      }

      lastError = "Gemini returned empty content.";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  console.warn("[Subtitle Bridge] Gemini fallback failed:", lastError);
  return null;
}

async function streamGeminiAI(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal,
  debugContext = "unknown",
): Promise<{ success: boolean; content: string; error?: string } | null> {
  const apiKeys = await ensureGeminiKeysLoaded();
  if (!apiKeys.length) return null;

  const model = getGeminiModel();
  let lastError = "";

  for (const apiKey of apiKeys) {
    let accumulated = "";
    let reqId: string | null = null;

    try {
      reqId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      debugStore.startRequest(reqId, `${debugContext}:gemini`);

      const res = await fetch(buildGeminiStreamContentUrl(model, apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(buildGeminiPayload(messages, maxTokens, temperature)),
      });

      const responseText = !res.ok ? await res.text().catch(() => "") : "";
      if (!res.ok) {
        throw new Error(`Gemini HTTP ${res.status}: ${responseText.slice(0, 220)}`);
      }
      if (!res.body) throw new Error("Gemini returned no response body.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") break;

          try {
            const token = extractGeminiText(JSON.parse(payload));
            if (!token) continue;
            accumulated += token;
            onToken(token, accumulated);
            debugStore.addToken(reqId, token, accumulated);
          } catch {
            // Ignore malformed SSE chunks and continue streaming.
          }
        }
      }

      debugStore.endRequest(reqId, true);
      return { success: true, content: accumulated };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (reqId) debugStore.endRequest(reqId, accumulated.length > 0, true);
        return { success: accumulated.length > 0, content: accumulated };
      }

      lastError = err instanceof Error ? err.message : String(err);
      if (reqId) debugStore.endRequest(reqId, false);
      if (accumulated.trim()) return { success: true, content: accumulated };
    }
  }

  console.warn("[Subtitle Bridge] Gemini streaming fallback failed:", lastError);
  return null;
}

// ─── Mock response pools (offline / no AI server) ────────────────────────────
// Used when 127.0.0.1:8010 is unreachable. Responses follow the exact format
// that parseRating() expects so the full UI flow works without a real AI.

const MOCK_QUESTION_RESPONSES = [
  `[PARCIAL] - ~72% de comprensión
BIEN: ✅ Tu respuesta captura la idea central correctamente y demuestra comprensión básica del concepto.
FALTÓ: ⚠️ Podrías profundizar en el mecanismo interno. Por ejemplo, ¿qué sucede a nivel de memoria (heap vs stack) cuando ocurre este proceso?
PROFUNDIZACIÓN: 🎯 ¿Cómo cambiaría tu respuesta si hubiera múltiples threads accediendo al mismo objeto simultáneamente?`,

  `[CORRECTO] - ~88% de comprensión
BIEN: ✅ Excelente. Identificaste correctamente los conceptos clave y la relación entre ellos. La explicación es clara y precisa.
FALTÓ: 💡 Para nivel senior, menciona las implicaciones de rendimiento: ¿cuándo preferirías una alternativa?
PROFUNDIZACIÓN: 🎯 Diseña un escenario donde este concepto cause un bug sutil en producción con alta concurrencia.`,

  `[INCORRECTO] - ~35% de comprensión
BIEN: ✅ Estás en la dirección correcta con la idea general, eso es un buen punto de partida.
FALTÓ: ❌ La respuesta confunde dos conceptos distintos. Recuerda: uno opera a nivel de compilación y el otro a nivel de ejecución en la JVM.
PROFUNDIZACIÓN: 🔁 Vuelve al concepto desde cero: ¿qué produce javac exactamente y qué consume la JVM?`,

  `[PARCIAL] - ~65% de comprensión
BIEN: ✅ Mencionaste los elementos correctos aunque sin conectar la cadena de causa-efecto completa.
FALTÓ: ⚠️ Faltó explicar qué ocurre cuando el caso límite se cumple. Ese es el detalle que diferencia una respuesta junior de una senior.
PROFUNDIZACIÓN: 🎯 Dame un ejemplo de código real (5 líneas máx.) que demuestre el comportamiento que describiste.`,
];

const MOCK_CODE_RESPONSES = [
  `[PARCIAL]
DIAGNÓSTICO: La solución identifica el problema principal pero omite el caso borde más crítico en producción.
BIEN: ✅ La lógica central es correcta y el enfoque es válido. Se nota comprensión del problema.
MEJORAR: ⚠️ Agrega validación de null antes del unboxing. En producción con datos de BD, ese null puede aparecer en cualquier momento.
NIVEL SENIOR: 🚀 Usa Optional<T> para modelar la ausencia de valor explícitamente — elimina los null checks ad-hoc y hace el contrato del método más claro.`,

  `[CORRECTO]
DIAGNÓSTICO: Solución limpia y correcta. Demuestra comprensión sólida de los conceptos.
BIEN: ✅ Identificaste ambos bugs y aplicaste los fixes correctos. El uso de .equals() y el AtomicInteger son exactamente lo que se espera.
MEJORAR: 💡 El código funciona, pero considera extraer la lógica de comparación a un método privado — mejora la legibilidad y testabilidad.
NIVEL SENIOR: 🚀 Añade un test unitario con dos threads concurrentes que verifique el comportamiento thread-safe. Sin ese test, el bug puede reaparecer silenciosamente en un refactor futuro.`,

  `[INCORRECTO]
DIAGNÓSTICO: La solución no resuelve el problema de fondo — cambia la sintaxis pero no el comportamiento.
BIEN: ✅ Reconociste que había algo incorrecto en la comparación, eso es el primer paso.
MEJORAR: ❌ El cambio que hiciste sigue usando == bajo el capó en un caso. Traza la ejecución paso a paso: ¿qué objetos se crean en el heap y qué referencias compara == exactamente?
NIVEL SENIOR: 🚀 Antes de corregir un bug de concurrencia, escribe el test que lo reproduce de forma determinista. Si no puedes escribir el test, aún no entiendes completamente el bug.`,
];

// Index to rotate through mock responses for variety
let _mockEvalIdx = 0;
let _mockCodeIdx = 0;

// Streams mock text token-by-token to simulate SSE, respects AbortSignal
async function mockStreamText(
  text: string,
  onToken: (token: string, acc: string) => void,
  signal?: AbortSignal,
  delayMs = 28,
): Promise<string> {
  // Split into word-level tokens including spaces & punctuation for natural feel
  const tokens = text.match(/\S+|\s+/g) ?? [];
  let acc = "";
  for (const tok of tokens) {
    if (signal?.aborted) break;
    await new Promise<void>((r) => setTimeout(r, delayMs + Math.random() * 20));
    if (signal?.aborted) break;
    acc += tok;
    onToken(tok, acc);
  }
  return acc;
}

function isLocalAiCoolingDown(): boolean {
  return Date.now() < localAiRetryAfter;
}

function markLocalAiUnavailable(): void {
  localAiRetryAfter = Math.max(localAiRetryAfter, Date.now() + LOCAL_AI_RETRY_AFTER_MS);
}

function isLocalConnectionError(message: string): boolean {
  return (
    message.includes("Failed to fetch") ||
    message.includes("fetch") ||
    message.includes("NetworkError") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ERR_CONNECTION_REFUSED")
  );
}

async function fallbackNonStreamingAI(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  debugContext: string,
): Promise<AIResponse> {
  const gemini = await callGeminiAI(messages, maxTokens, temperature);
  if (gemini?.success) return gemini;

  if (debugContext === "translate") {
    const userMessages = messages
      .filter((message) => message.role === "user")
      .map((message) => message.content.trim())
      .filter(Boolean);
    const sourceText = userMessages.length > 0 ? userMessages[userMessages.length - 1] : "";

    return {
      success: true,
      content: sourceText,
      rating: "unknown",
      isMock: true,
    };
  }

  const mockContent =
    debugContext === "eval-code"
      ? MOCK_CODE_RESPONSES[_mockCodeIdx++ % MOCK_CODE_RESPONSES.length]
      : MOCK_QUESTION_RESPONSES[_mockEvalIdx++ % MOCK_QUESTION_RESPONSES.length];
  return { success: true, content: mockContent, rating: parseRating(mockContent), isMock: true };
}

// ─── Non-streaming core fetch ─────────────────────────────────────────────────
async function callLocalAI(
  messages: AIMessage[],
  maxTokens = 500,
  temperature = 0.3,
  debugContext = "unknown",
): Promise<AIResponse> {
  if (isLocalAiCoolingDown()) {
    return fallbackNonStreamingAI(messages, maxTokens, temperature, debugContext);
  }

  try {
    const res = await fetch(`${LOCAL_AI_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local-model",
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content?.trim() ?? "";
    return { success: true, content, rating: parseRating(content) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isConnectionError = isLocalConnectionError(msg);

    // ── Gemini fallback before mock ───────────────────────────────────────────
    if (isConnectionError) {
      markLocalAiUnavailable();
      return fallbackNonStreamingAI(messages, maxTokens, temperature, debugContext);
    }

    return {
      success: false,
      content: "",
      rating: "unknown",
      error: `Error: ${msg}`,
    };
  }
}

// ─── Rating parser ────────────────────────────────────────────────────────────
function parseRating(content: string): AIRating {
  const upper = content.toUpperCase();
  if (
    upper.includes("[EXCELENTE]") ||
    upper.includes("COMPRENSIÓN: EXCELENTE") ||
    upper.includes("COMPRENSION: EXCELENTE")
  ) return "excellent";
  if (
    upper.includes("[CORRECTO]") ||
    upper.includes("COMPRENSION: PROFUNDA") ||
    upper.includes("COMPRENSIÓN: PROFUNDA")
  ) return "correct";
  if (
    upper.includes("[PARCIAL]") ||
    upper.includes("COMPRENSION: SOLIDA") ||
    upper.includes("COMPRENSIÓN: SÓLIDA")
  ) return "partial";
  if (
    upper.includes("[INCORRECTO]") ||
    upper.includes("COMPRENSION: BASICA") ||
    upper.includes("COMPRENSIÓN: BÁSICA")
  ) return "wrong";
  const correctMatches = (content.match(/\u2705/g) || []).length;
  const wrongMatches   = (content.match(/\u274c/g) || []).length;
  if (correctMatches > wrongMatches) return "partial";
  if (wrongMatches > correctMatches) return "wrong";
  return "unknown";
}

// ─── Streaming SSE core ───────────────────────────────────────────────────────
export async function streamLocalAI(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal,
  debugContext = "unknown"
): Promise<{ success: boolean; content: string; error?: string; isMock?: boolean }> {
  let accumulated = "";

  // ── Debug tracking (lazy import to avoid circular deps) ───────────────────
  let reqId: string | null = null;
  try {
    reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    debugStore.startRequest(reqId, debugContext);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) { /* debug store unavailable — continue silently */ }

  try {
    if (isLocalAiCoolingDown()) {
      throw new Error("ECONNREFUSED: local AI temporarily disabled after previous connection failure");
    }

    const res = await fetch(`${LOCAL_AI_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: "local-model",
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    if (!res.body) throw new Error("No response body");

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") break;

        try {
          const json  = JSON.parse(payload);
          const token: string = json.choices?.[0]?.delta?.content ?? "";
          if (token) {
            accumulated += token;
            onToken(token, accumulated);
            if (reqId) {
              debugStore.addToken(reqId, token, accumulated);
            }
          }
        } catch (_e) {
          // Skip malformed SSE chunk
        }
      }
    }

    if (reqId) {
      debugStore.endRequest(reqId, true);
    }
    return { success: true, content: accumulated };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (reqId) {
        try {
          debugStore.endRequest(reqId, accumulated.length > 0, true);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) { /* ignore */ }
      }
      return { success: accumulated.length > 0, content: accumulated };
    }

    const msg = err instanceof Error ? err.message : String(err);
    const isNetwork = isLocalConnectionError(msg);

    if (reqId) {
      try {
        debugStore.endRequest(reqId, false);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) { /* ignore */ }
    }

    // ── Gemini fallback before mock — this is the real chain from Figma:
    // IA Local (8010) -> Gemini Key 1 -> Gemini Key 2 -> Mock.
    if (isNetwork) {
      markLocalAiUnavailable();
      const gemini = await streamGeminiAI(
        messages,
        maxTokens,
        temperature,
        onToken,
        signal,
        debugContext,
      );
      if (gemini?.success) return gemini;
    }

    // ── Offline mock fallback — stream a realistic response token by token ────
    if (isNetwork) {
      const mockContent =
        debugContext === "eval-code"
          ? MOCK_CODE_RESPONSES[_mockCodeIdx++ % MOCK_CODE_RESPONSES.length]
          : debugContext === "translate"
          ? "" // translation has its own mock in TranslationPipeline
          : MOCK_QUESTION_RESPONSES[_mockEvalIdx++ % MOCK_QUESTION_RESPONSES.length];

      if (mockContent) {
        // Register a mock request in the debug store so the Dev tab shows activity
        let mockReqId: string | null = null;
        try {
          mockReqId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          debugStore.startRequest(mockReqId, `${debugContext}:mock`);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) { /* ignore */ }

        const finalContent = await mockStreamText(mockContent, (tok, acc) => {
          onToken(tok, acc);
          // Feed tokens into debug store
          if (mockReqId) {
            debugStore.addToken(mockReqId, tok, acc);
          }
        }, signal);

        if (mockReqId) {
          try {
            debugStore.endRequest(mockReqId, true);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (_) { /* ignore */ }
        }

        return { success: true, content: finalContent, isMock: true };
      }
    }

    return {
      success: false,
      content: accumulated,
      error: isNetwork
        ? "No se puede conectar a la IA local. Verifica que el servidor este corriendo en 127.0.0.1:8010."
        : `Error: ${msg}`,
    };
  }
}

// ─── Feynman evaluation ───────────────────────────────────────────────────────
export async function evaluateFeynman(
  topic: string,
  modelAnswer: string,
  studentAnswer: string
): Promise<AIResponse> {
  if (!studentAnswer.trim())
    return { success: false, content: "", rating: "unknown", error: "Escribe tu explicacion primero." };

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "Eres un experto en ensenanza de programacion con 15 anos de experiencia en Java y Spring Boot.\n" +
        "Evaluas si el estudiante realmente entendio el concepto usando la Tecnica Feynman.\n" +
        "Se especifico, pedagogico y motivador. Responde SIEMPRE en espanol.\n" +
        "NO repitas la respuesta modelo al estudiante directamente.",
    },
    {
      role: "user",
      content:
        `Evalua la explicacion Feynman del estudiante sobre: "${topic}"\n\n` +
        `RESPUESTA MODELO (referencia interna, no la copies textualmente):\n${modelAnswer}\n\n` +
        `EXPLICACION DEL ESTUDIANTE:\n${studentAnswer}\n\n` +
        "Responde con este formato EXACTO (sin texto extra antes o despues):\n" +
        "COMPRENSION: [Basica|Solida|Profunda] - [una frase de evaluacion]\n" +
        "CORRECTO: [lo que explico bien en 1-2 frases]\n" +
        "FALTO: [que concepto clave no menciono, max 2 puntos]\n" +
        "PARA COMPLETAR: [una sola oracion que anade lo que falto]\n" +
        "PREGUNTA: [una pregunta que lleve al estudiante un nivel mas arriba]",
    },
  ];

  return callLocalAI(messages, 450);
}

// ─── Active question evaluation — message builder ─────────────────────────────
function buildEvalQuestionMessages(
  question: string,
  expectedAnswer: string,
  studentAnswer: string,
  bloomLevel: string
): AIMessage[] {
  return [
    {
      role: "system",
      content:
        `Eres un profesor senior de programacion Java/Spring Boot evaluando respuestas de estudiantes.\n` +
        `El objetivo cognitivo de esta pregunta es nivel "${bloomLevel}" segun la Taxonomia de Bloom.\n` +
        `Se preciso, constructivo y directo. Responde SIEMPRE en espanol.`,
    },
    {
      role: "user",
      content:
        `PREGUNTA (nivel ${bloomLevel}): ${question}\n\n` +
        `RESPUESTA ESPERADA (referencia interna):\n${expectedAnswer}\n\n` +
        `RESPUESTA DEL ESTUDIANTE:\n${studentAnswer}\n\n` +
        "Evalua con este formato EXACTO:\n" +
        "[CORRECTO|PARCIAL|INCORRECTO] - [estimacion: ej. 85% de comprension]\n" +
        "BIEN: [que estuvo correcto en 1 frase especifica]\n" +
        "FALTO: [que falto o estuvo inexacto, con el concepto correcto]\n" +
        "PROFUNDIZACION: [una pregunta de seguimiento al siguiente nivel cognitivo de Bloom]",
    },
  ];
}

// ─── Active question evaluation — non-streaming ───────────────────────────────
export async function evaluateActiveAnswer(
  question: string,
  expectedAnswer: string,
  studentAnswer: string,
  bloomLevel: string
): Promise<AIResponse> {
  if (!studentAnswer.trim())
    return { success: false, content: "", rating: "unknown", error: "Escribe tu respuesta primero." };

  const messages = buildEvalQuestionMessages(question, expectedAnswer, studentAnswer, bloomLevel);
  return callLocalAI(messages, 380);
}

// ─── Active question evaluation — STREAMING ──────────────────────────────────
export async function evaluateActiveAnswerStream(
  question: string,
  expectedAnswer: string,
  studentAnswer: string,
  bloomLevel: string,
  onToken: (token: string, accumulated: string) => void
): Promise<{ success: boolean; content: string; rating: AIRating; isMock?: boolean }> {
  if (!studentAnswer.trim())
    return { success: false, content: "", rating: "unknown" };

  const messages = buildEvalQuestionMessages(question, expectedAnswer, studentAnswer, bloomLevel);
  const result   = await streamLocalAI(messages, 380, 0.3, onToken, undefined, "eval-question");
  return { success: result.success, content: result.content, rating: parseRating(result.content), isMock: result.isMock };
}

// ─── Code review — message builder ───────────────────────────────────────────
function buildCodeReviewMessages(
  challengeTitle: string,
  expectedSolution: string,
  studentCode: string
): AIMessage[] {
  return [
    {
      role: "system",
      content:
        "Eres un dev senior Java/Spring Boot haciendo code review educativo.\n" +
        "Tu objetivo es que el estudiante entienda sus errores y mejore.\n" +
        "Se especifico con el codigo, usa snippets concretos cuando sea necesario. Responde en espanol.",
    },
    {
      role: "user",
      content:
        `DESAFIO: ${challengeTitle}\n\n` +
        `SOLUCION DE REFERENCIA:\n${expectedSolution}\n\n` +
        `CODIGO DEL ESTUDIANTE:\n${studentCode}\n\n` +
        "Code review educativo con este formato EXACTO:\n" +
        "[CORRECTO|PARCIAL|INCORRECTO]\n" +
        "DIAGNOSTICO: [1 frase que resume la calidad de la solucion]\n" +
        "BIEN: [que hizo correctamente, 1-2 puntos concretos]\n" +
        "MEJORAR: [que cambiaria y por que, con snippet si aplica]\n" +
        "NIVEL SENIOR: [una sola sugerencia para llevar la solucion a nivel senior]",
    },
  ];
}

// ─── Code review — non-streaming ─────────────────────────────────────────────
export async function evaluateCodeSolution(
  challengeTitle: string,
  expectedSolution: string,
  studentCode: string
): Promise<AIResponse> {
  if (!studentCode.trim())
    return { success: false, content: "", rating: "unknown", error: "Escribe tu solucion primero." };

  const messages = buildCodeReviewMessages(challengeTitle, expectedSolution, studentCode);
  return callLocalAI(messages, 500, 0.2);
}

// ─── Code review — STREAMING ─────────────────────────────────────────────────
export async function evaluateCodeSolutionStream(
  challengeTitle: string,
  expectedSolution: string,
  studentCode: string,
  onToken: (token: string, accumulated: string) => void
): Promise<{ success: boolean; content: string; rating: AIRating; isMock?: boolean }> {
  if (!studentCode.trim())
    return { success: false, content: "", rating: "unknown" };

  const messages = buildCodeReviewMessages(challengeTitle, expectedSolution, studentCode);
  const result   = await streamLocalAI(messages, 500, 0.2, onToken, undefined, "eval-code");
  return { success: result.success, content: result.content, rating: parseRating(result.content), isMock: result.isMock };
}

// ─── Subtitle translation — non-streaming ────────────────────────────────────
export async function translateLine(en: string): Promise<AIResponse> {
  if (!en.trim())
    return { success: false, content: "", rating: "unknown", error: "Linea vacia." };

  const messages = buildTranslateMessages(en);
  return callLocalAI(messages, 120, 0.1, "translate");
}

// ─── Subtitle translation — STREAMING ────────────────────────────────────────
// Each token is delivered to onToken as it arrives from the SSE stream.
// Falls back gracefully when the AI server is not reachable.
export async function translateLineStream(
  en: string,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; content: string; isMock?: boolean }> {
  if (!en.trim()) return { success: false, content: "" };

  const messages = buildTranslateMessages(en);
  const startedAt = performance.now();
  const result   = await streamLocalAI(messages, 120, 0.1, onToken, signal, "translate");
  if (!signal?.aborted && result.success && result.content.trim()) {
    debugStore.addCacheEntry({
      en: en.trim(),
      es: result.content.trim(),
      latencyMs: Math.round(performance.now() - startedAt),
      usedAI: !result.isMock,
      timestamp: Date.now(),
    });
  }
  return { success: result.success, content: result.content, isMock: result.isMock };
}

function buildTranslateMessages(en: string): AIMessage[] {
  return [
    {
      role: "system",
      content:
        "Eres un traductor tecnico especializado en cursos de programacion en ingles. " +
        "Traduce el texto al espanol de forma natural y precisa conservando los terminos " +
        "tecnicos en ingles cuando sea mas claro (p.ej. JVM, heap, thread, etc.). " +
        "Responde UNICAMENTE con la traduccion, sin comillas ni explicaciones.",
    },
    { role: "user", content: en.trim() },
  ];
}
