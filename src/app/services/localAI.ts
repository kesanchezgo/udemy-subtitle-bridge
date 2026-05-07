import { buildGeminiGenerateContentUrl, buildGeminiStreamContentUrl, normalizeGeminiKeys } from '../../gemini-config';

const LOCAL_AI_URL = 'http://127.0.0.1:8010';
const LOCAL_AI_MODEL = 'local-model';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Ping local AI at 8010 to check if it's online.
 */
export async function checkLocalAIHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${LOCAL_AI_URL}/v1/models`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export type AIRating = 'correct' | 'partial' | 'wrong' | 'unknown';

export interface AIResponse {
  success: boolean;
  content: string;
  rating: AIRating;
  error?: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getGeminiApiKeys(): string[] {
  const g = globalThis as typeof globalThis & { USB_GEMINI_API_KEYS?: string[] };
  return Array.isArray(g.USB_GEMINI_API_KEYS) ? normalizeGeminiKeys(g.USB_GEMINI_API_KEYS) : [];
}

function getGeminiModel(): string {
  const g = globalThis as typeof globalThis & { USB_GEMINI_MODEL?: string };
  return String(g.USB_GEMINI_MODEL || GEMINI_MODEL).trim();
}

async function callGemini(messages: AIMessage[], maxTokens: number, temperature: number): Promise<string> {
  const apiKeys = getGeminiApiKeys();
  if (!apiKeys.length) {
    throw new Error('No Gemini API keys configured.');
  }

  const model = getGeminiModel();
  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role !== 'system');

  const body: Record<string, unknown> = {
    contents: userMessages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature, maxOutputTokens: maxTokens }
  };

  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] };
  }

  let lastError: Error | null = null;

  for (const apiKey of apiKeys) {
    try {
      const normalizedKey = apiKey.trim();
      const response = await fetch(buildGeminiGenerateContentUrl(model, normalizedKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Gemini HTTP ${response.status}: ${text.slice(0, 260)}`);
      }

      const parsed = JSON.parse(text);
      const content = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error('Gemini returned empty content.');
      }

      return String(content);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('All Gemini API keys failed.');
}

async function callWithFallback(messages: AIMessage[], maxTokens: number, temperature: number): Promise<string> {
  try {
    return await callLocalAI(messages, maxTokens, temperature);
  } catch (_localError) {
    return await callGemini(messages, maxTokens, temperature);
  }
}

type LocalAiDebugStore = {
  startRequest: (id: string, context: string) => void;
  addToken: (id: string, token: string, accumulated: string) => void;
  endRequest: (id: string, success: boolean, aborted?: boolean) => void;
};

function extractAssistantContent(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  return String(choice?.delta?.content ?? choice?.message?.content ?? payload?.content ?? '');
}

function normalizeForRating(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseRating(content: string): AIRating {
  const normalized = normalizeForRating(content);

  if (normalized.includes('[correcto]') || normalized.includes('comprension: profunda') || normalized.includes('comprehension: profunda') || normalized.includes('correct')) {
    return 'correct';
  }

  if (normalized.includes('[parcial]') || normalized.includes('comprension: solida') || normalized.includes('comprehension: solida') || normalized.includes('partial')) {
    return 'partial';
  }

  if (normalized.includes('[incorrecto]') || normalized.includes('comprension: basica') || normalized.includes('comprehension: basica') || normalized.includes('wrong')) {
    return 'wrong';
  }

  const correctCount = (content.match(/✅/g) || []).length;
  const wrongCount = (content.match(/❌/g) || []).length;
  if (correctCount > wrongCount && correctCount > 0) {
    return 'correct';
  }
  if (wrongCount > correctCount && wrongCount > 0) {
    return 'wrong';
  }

  return 'unknown';
}

async function callLocalAI(messages: AIMessage[], maxTokens: number, temperature: number) {
  const response = await fetch(`${LOCAL_AI_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: LOCAL_AI_MODEL,
      messages,
      stream: false,
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    throw new Error(`Local AI request failed with ${response.status}.`);
  }

  const data = await response.json();
  return extractAssistantContent(data);
}

async function getDebugStore() {
  const mod = await import('./debugStore');
  return mod.debugStore as unknown as LocalAiDebugStore;
}

async function streamGemini(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal,
  debugContext = 'unknown'
): Promise<{ success: boolean; content: string; error?: string }> {
  const apiKeys = getGeminiApiKeys();
  if (!apiKeys.length) {
    return { success: false, content: '', error: 'No Gemini API keys configured.' };
  }

  const model = getGeminiModel();
  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role !== 'system');

  const body: Record<string, unknown> = {
    contents: userMessages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature, maxOutputTokens: maxTokens }
  };

  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] };
  }

  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const debugStore = await getDebugStore();
  debugStore.startRequest(reqId, `${debugContext}-gemini`);

  let lastError: Error | null = null;

  for (const apiKey of apiKeys) {
    try {
      const normalizedKey = apiKey.trim();
      const response = await fetch(buildGeminiStreamContentUrl(model, normalizedKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        throw new Error(`Gemini HTTP ${response.status}: ${text.slice(0, 260)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            await reader.cancel().catch(() => undefined);
            debugStore.endRequest(reqId, true);
            return { success: true, content: accumulated };
          }

          try {
            const parsed = JSON.parse(payload);
            const token = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (!token) continue;

            accumulated += token;
            debugStore.addToken(reqId, token, accumulated);
            onToken(token, accumulated);
          } catch (_parseErr) {
            // skip malformed chunk
          }
        }
      }

      debugStore.endRequest(reqId, true);
      return { success: true, content: accumulated };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        debugStore.endRequest(reqId, false, true);
        return { success: false, content: '', error: 'Aborted' };
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  debugStore.endRequest(reqId, false);
  return { success: false, content: '', error: lastError?.message || 'All Gemini keys failed.' };
}

async function streamWithFallback(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal,
  debugContext = 'unknown'
): Promise<{ success: boolean; content: string; error?: string }> {
  const localResult = await streamLocalAI(messages, maxTokens, temperature, onToken, signal, debugContext);
  if (localResult.success && localResult.content.trim()) {
    return localResult;
  }
  if (signal?.aborted) {
    return localResult;
  }
  return streamGemini(messages, maxTokens, temperature, onToken, signal, debugContext);
}

async function streamLocalAI(
  messages: AIMessage[],
  maxTokens: number,
  temperature: number,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal,
  debugContext = 'unknown'
): Promise<{ success: boolean; content: string; error?: string }> {
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const debugStore = await getDebugStore();
  debugStore.startRequest(reqId, debugContext);

  try {
    const response = await fetch(`${LOCAL_AI_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: LOCAL_AI_MODEL,
        messages,
        stream: true,
        temperature,
        max_tokens: maxTokens
      }),
      signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Local AI streaming request failed with ${response.status}.`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data: ')) {
          continue;
        }

        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
          await reader.cancel().catch(() => undefined);
          debugStore.endRequest(reqId, true);
          return { success: true, content: accumulated };
        }

        try {
          const parsed = JSON.parse(payload);
          const token = extractAssistantContent(parsed);
          if (!token) {
            continue;
          }

          accumulated += token;
          debugStore.addToken(reqId, token, accumulated);
          onToken(token, accumulated);
        } catch (_error) {
          // Ignore malformed chunks and keep the stream alive.
        }
      }
    }

    if (buffer.trim().startsWith('data: ')) {
      const payload = buffer.trim().slice(6).trim();
      if (payload !== '[DONE]') {
        try {
          const parsed = JSON.parse(payload);
          const token = extractAssistantContent(parsed);
          if (token) {
            accumulated += token;
            debugStore.addToken(reqId, token, accumulated);
            onToken(token, accumulated);
          }
        } catch (_error) {
          // Ignore last partial chunk.
        }
      }
    }

    debugStore.endRequest(reqId, true);
    return { success: true, content: accumulated };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    debugStore.endRequest(reqId, false, aborted);
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function buildTranslateMessages(en: string): AIMessage[] {
  return [
    {
      role: 'system',
      content: 'Eres un traductor técnico especializado en cursos de programación en inglés. Traduce el texto al español de forma natural y precisa conservando los términos técnicos en inglés cuando sea más claro (p.ej. JVM, heap, thread, etc.). Responde ÚNICAMENTE con la traducción, sin comillas ni explicaciones.'
    },
    {
      role: 'user',
      content: en
    }
  ];
}

export function buildEvalQuestionMessages(question: string, expectedAnswer: string, studentAnswer: string, bloomLevel: string): AIMessage[] {
  return [
    {
      role: 'system',
      content: `Eres un profesor senior de programación Java/Spring Boot evaluando respuestas de estudiantes. El objetivo cognitivo de esta pregunta es nivel "${bloomLevel}" según la Taxonomía de Bloom. Sé preciso, constructivo y directo. Responde SIEMPRE en español.`
    },
    {
      role: 'user',
      content: [
        `PREGUNTA (nivel ${bloomLevel}): ${question}`,
        '',
        'RESPUESTA ESPERADA (referencia interna):',
        expectedAnswer,
        '',
        'RESPUESTA DEL ESTUDIANTE:',
        studentAnswer,
        '',
        'Evalúa con este formato EXACTO:',
        '[CORRECTO|PARCIAL|INCORRECTO] - [estimación: ej. 85% de comprensión]',
        'BIEN: [qué estuvo correcto en 1 frase específica]',
        'FALTÓ: [qué faltó o estuvo inexacto, con el concepto correcto]',
        'PROFUNDIZACIÓN: [una pregunta de seguimiento al siguiente nivel cognitivo de Bloom]'
      ].join('\n')
    }
  ];
}

export function buildCodeReviewMessages(challengeTitle: string, expectedSolution: string, studentCode: string): AIMessage[] {
  return [
    {
      role: 'system',
      content: 'Eres un dev senior Java/Spring Boot haciendo code review educativo. Tu objetivo es que el estudiante entienda sus errores y mejore. Sé específico con el código, usa snippets concretos cuando sea necesario. Responde en español.'
    },
    {
      role: 'user',
      content: [
        `DESAFÍO: ${challengeTitle}`,
        '',
        'SOLUCIÓN DE REFERENCIA:',
        expectedSolution,
        '',
        'CÓDIGO DEL ESTUDIANTE:',
        studentCode,
        '',
        'Code review educativo con este formato EXACTO:',
        '[CORRECTO|PARCIAL|INCORRECTO]',
        'DIAGNÓSTICO: [1 frase que resume la calidad de la solución]',
        'BIEN: [qué hizo correctamente, 1-2 puntos concretos]',
        'MEJORAR: [qué cambiaría y por qué, con snippet si aplica]',
        'NIVEL SENIOR: [una sola sugerencia para llevar la solución a nivel senior]'
      ].join('\n')
    }
  ];
}

function buildFeynmanMessages(topic: string, modelAnswer: string, studentAnswer: string): AIMessage[] {
  return [
    {
      role: 'system',
      content: 'Eres un experto en enseñanza de programación con 15 años de experiencia en Java y Spring Boot. Evalúas si el estudiante realmente entendió el concepto usando la Técnica Feynman. Sé específico, pedagógico y motivador. Responde SIEMPRE en español. NO repitas la respuesta modelo al estudiante directamente.'
    },
    {
      role: 'user',
      content: [
        `Evalúa la explicación Feynman del estudiante sobre: "${topic}"`,
        '',
        'RESPUESTA MODELO (referencia interna, no la copies textualmente):',
        modelAnswer,
        '',
        'EXPLICACIÓN DEL ESTUDIANTE:',
        studentAnswer,
        '',
        'Responde con este formato EXACTO (sin texto extra antes o después):',
        'COMPRENSIÓN: [Básica|Sólida|Profunda] - [una frase de evaluación]',
        'CORRECTO: [lo que explicó bien en 1-2 frases]',
        'FALTÓ: [qué concepto clave no mencionó, max 2 puntos]',
        'PARA COMPLETAR: [una sola oración que añade lo que faltó]',
        'PREGUNTA: [una pregunta que lleve al estudiante un nivel más arriba]'
      ].join('\n')
    }
  ];
}

export async function translateLine(en: string): Promise<AIResponse> {
  try {
    const content = await callWithFallback(buildTranslateMessages(en), 120, 0.1);
    return { success: true, content, rating: parseRating(content) };
  } catch (error) {
    return { success: false, content: '', rating: 'unknown', error: error instanceof Error ? error.message : String(error) };
  }
}

export async function translateLineStream(
  en: string,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; content: string }> {
  const result = await streamWithFallback(buildTranslateMessages(en), 120, 0.1, onToken, signal, 'traducir');
  return { success: result.success, content: result.content };
}

export async function evaluateActiveAnswer(question: string, expectedAnswer: string, studentAnswer: string, bloomLevel: string): Promise<AIResponse> {
  try {
    const content = await callWithFallback(buildEvalQuestionMessages(question, expectedAnswer, studentAnswer, bloomLevel), 380, 0.3);
    return { success: true, content, rating: parseRating(content) };
  } catch (error) {
    return { success: false, content: '', rating: 'unknown', error: error instanceof Error ? error.message : String(error) };
  }
}

export async function evaluateActiveAnswerStream(
  question: string,
  expectedAnswer: string,
  studentAnswer: string,
  bloomLevel: string,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; content: string; rating: AIRating }> {
  const result = await streamWithFallback(buildEvalQuestionMessages(question, expectedAnswer, studentAnswer, bloomLevel), 380, 0.3, onToken, signal, 'eval-question');
  return { success: result.success, content: result.content, rating: parseRating(result.content) };
}

export async function evaluateCodeSolution(challengeTitle: string, expectedSolution: string, studentCode: string): Promise<AIResponse> {
  try {
    const content = await callWithFallback(buildCodeReviewMessages(challengeTitle, expectedSolution, studentCode), 500, 0.2);
    return { success: true, content, rating: parseRating(content) };
  } catch (error) {
    return { success: false, content: '', rating: 'unknown', error: error instanceof Error ? error.message : String(error) };
  }
}

export async function evaluateCodeSolutionStream(
  challengeTitle: string,
  expectedSolution: string,
  studentCode: string,
  onToken: (token: string, accumulated: string) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; content: string; rating: AIRating }> {
  const result = await streamWithFallback(buildCodeReviewMessages(challengeTitle, expectedSolution, studentCode), 500, 0.2, onToken, signal, 'eval-code');
  return { success: result.success, content: result.content, rating: parseRating(result.content) };
}

export async function evaluateFeynman(topic: string, modelAnswer: string, studentAnswer: string): Promise<AIResponse> {
  try {
    const content = await callWithFallback(buildFeynmanMessages(topic, modelAnswer, studentAnswer), 450, 0.3);
    return { success: true, content, rating: parseRating(content) };
  } catch (error) {
    return { success: false, content: '', rating: 'unknown', error: error instanceof Error ? error.message : String(error) };
  }
}
