/**
 * Dudas sobre la lección — Study §5 (docs/STUDY_FLOW_PEDAGOGY.md).
 *
 * Diseñado para el uso real: cada lección se estudia UNA vez y a donde se
 * vuelve es a Anki. Por eso:
 * - La duda aparece al intentar, no al mirar (la fluidez del vídeo da
 *   sensación de entender): se pregunta en Study tras el recuerdo libre o el
 *   feedback, anclada a la idea, la pregunta o el desafío.
 * - Se resuelve en la misma sesión y lo que perdura es la tarjeta (máx. 2 por
 *   lección, de refuerzo).
 * - La respuesta se apoya SOLO en la transcripción; las citas se verifican
 *   literalmente contra ella. Sin transcripción temporizada no hay minutos.
 * - Hilo acotado: 1 pregunta + 2 repreguntas, sin preguntas al estudiante (§4).
 * - Sin IA: fragmentos de la lección, marcados como «Local» y sin tarjeta.
 */
import { streamLocalAI, type AIMessage } from "./localAI";

export type LessonDoubtKind = "concepts" | "question" | "practice";

/** 1 pregunta + 2 repreguntas por duda. */
export const MAX_DOUBT_TURNS = 3;
/** Tarjetas de duda por lección (preferencia de diseño, como el máx. 2 de §3). */
export const MAX_DOUBT_CARDS = 2;
/** Mismo presupuesto de transcripción que la generación de la sesión. */
export const DOUBT_TRANSCRIPT_CHARS = 22000;
const MAX_QUOTES = 2;
const MAX_THREADS = 12;

export interface LessonDoubtCard {
  front: string;
  back: string;
}

export interface LessonDoubtSaved {
  front: string;
  back: string;
  quote?: string;
}

export interface LessonDoubtTurn {
  q: string;
  answer: string;
  /** Solo citas verificadas literalmente en la transcripción. */
  quotes: string[];
  /** La transcripción no cubre la duda: orientación general, sin citas. */
  outside: boolean;
  /** Propuesta de tarjeta atómica (null si no aplica). */
  card: LessonDoubtCard | null;
  /** «ai»: proveedor de IA · «local»: fragmentos sin IA o demo de desarrollo. */
  source: "ai" | "local";
  at: number;
  /** Tarjeta guardada en el mazo desde ESTA respuesta (instantánea). */
  saved?: LessonDoubtSaved | null;
}

export interface LessonDoubtThread {
  /** Estable por ancla: la misma idea/pregunta/desafío reabre el mismo hilo. */
  id: string;
  kind: LessonDoubtKind;
  anchor: string;
  turns: LessonDoubtTurn[];
  updatedAt: number;
}

export interface LessonDoubtContext {
  course: string;
  lesson: string;
  objective?: string;
  kind: LessonDoubtKind;
  anchor: string;
  studentAnswer?: string;
  feedback?: string;
  keyConcepts?: string[];
}

export interface DoubtTranscript {
  text: string;
  truncated?: boolean;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fnv1a(source: string): string {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function clip(value: string, max: number): string {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function stripQuoteMarks(value: string): string {
  return String(value || "").trim().replace(/^["'«“‘]+|["'»”’]+$/g, "").trim();
}

export function normalizeForMatch(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Clave del frente de una tarjeta (texto o HTML). Mismo frente = mismo GUID en
 * Anki = una nota pisaría a la otra: no se guarda dos veces la misma tarjeta.
 */
export function cardFrontKey(front: string): string {
  return normalizeForMatch(String(front || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
}

export function doubtThreadId(kind: LessonDoubtKind, anchor: string): string {
  return `${kind}-${fnv1a(`${kind}|${normalizeForMatch(anchor)}`)}`;
}

/** Id de la tarjeta guardada desde una respuesta (estable mientras exista). */
export function doubtCardId(thread: LessonDoubtThread, turn: LessonDoubtTurn): string {
  return `duda-${thread.id}-${turn.at.toString(36)}`;
}

// ─── Verificación de citas ───────────────────────────────────────────────────
/**
 * Devuelve solo las citas que aparecen literalmente (salvo mayúsculas,
 * tildes, puntuación y espacios) en la transcripción. Mínimo 3 palabras.
 */
export function verifyQuotes(quotes: string[], transcript: string): string[] {
  const haystack = ` ${normalizeForMatch(transcript)} `;
  const out: string[] = [];
  for (const raw of quotes) {
    const quote = stripQuoteMarks(raw);
    const needle = normalizeForMatch(quote);
    if (needle.length < 15 || needle.split(" ").length < 3) continue;
    if (!haystack.includes(` ${needle} `)) continue;
    if (out.some((kept) => normalizeForMatch(kept) === needle)) continue;
    out.push(clip(quote, 260));
    if (out.length >= MAX_QUOTES) break;
  }
  return out;
}

// ─── Formato de respuesta del modelo ─────────────────────────────────────────
const OUTSIDE_RE = /^\s*FUERA DE LA LECCI[ÓO]N\s*:\s*/i;
const QUOTE_LINE_RE = /^\s*[-*•]?\s*CITA\s*:\s*(.*)$/i;
const CARD_LINE_RE = /^\s*[-*•]?\s*TARJETA\s*:\s*(.*)$/i;
const OUTSIDE_PREFIXES = ["FUERA DE LA LECCIÓN:", "FUERA DE LA LECCION:"];

function extractQuoted(value: string): string {
  const match = value.match(/«([^»]+)»|“([^”]+)”|"([^"]+)"/);
  return (match ? match[1] ?? match[2] ?? match[3] : value).trim();
}

/** Tras quitar «FUERA DE LA LECCIÓN:», la frase sigue en minúscula: capitalizar. */
function capitalizeFirst(value: string): string {
  return value.replace(/^(\s*)(\p{Ll})/u, (_m, space: string, letter: string) => `${space}${letter.toUpperCase()}`);
}

function parseCardLine(value: string): LessonDoubtCard | null {
  const [frontRaw, ...rest] = value.split("||");
  const front = clip(stripQuoteMarks(frontRaw ?? ""), 180);
  const back = clip(stripQuoteMarks(rest.join("||")), 260);
  if (front.length < 8 || back.length < 3) return null;
  return { front, back };
}

export interface ParsedDoubtAnswer {
  answer: string;
  quotes: string[];
  outside: boolean;
  card: LessonDoubtCard | null;
}

export function parseDoubtAnswer(raw: string, transcript: string): ParsedDoubtAnswer {
  let text = String(raw || "").replace(/\r/g, "").replace(/^```[a-z]*\n?|\n?```$/gi, "").trim();
  const outside = OUTSIDE_RE.test(text);
  if (outside) text = capitalizeFirst(text.replace(OUTSIDE_RE, ""));
  const prose: string[] = [];
  const quotes: string[] = [];
  let card: LessonDoubtCard | null = null;
  for (const line of text.split("\n")) {
    const quote = line.match(QUOTE_LINE_RE);
    if (quote) { quotes.push(extractQuoted(quote[1])); continue; }
    const cardLine = line.match(CARD_LINE_RE);
    if (cardLine) { card = parseCardLine(cardLine[1]) ?? card; continue; }
    prose.push(line);
  }
  const answer = clip(prose.join("\n").replace(/\n{3,}/g, "\n\n").trim(), 1400);
  return {
    answer,
    quotes: outside ? [] : verifyQuotes(quotes, transcript),
    outside,
    card: outside ? null : card,
  };
}

/**
 * Lo que se puede enseñar MIENTRAS llega el texto: sin las líneas CITA/TARJETA
 * (se muestran ya verificadas al terminar) ni el prefijo FUERA DE LA LECCIÓN
 * (se muestra como etiqueta).
 */
export function visibleDoubtText(accumulated: string): { text: string; outside: boolean } {
  let text = String(accumulated || "").replace(/\r/g, "");
  const head = text.trimStart().toUpperCase();
  if (head && head.length < OUTSIDE_PREFIXES[0].length && OUTSIDE_PREFIXES.some((p) => p.startsWith(head))) {
    return { text: "", outside: false };
  }
  const outside = OUTSIDE_RE.test(text);
  if (outside) text = capitalizeFirst(text.replace(OUTSIDE_RE, ""));
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (QUOTE_LINE_RE.test(line) || CARD_LINE_RE.test(line)) break;
    const isLast = i === lines.length - 1;
    if (isLast && line.trim() && /^\s*[-*•]?\s*(C(I(T(A)?)?)?|T(A(R(J(E(T(A)?)?)?)?)?)?)\s*$/i.test(line)) break;
    out.push(line);
  }
  return { text: out.join("\n").trim(), outside };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
const SYSTEM_RULES = [
  "Eres el tutor de Kinema para UNA lección concreta de un curso en vídeo. Resuelves la duda del estudiante usando SOLO la transcripción de esa lección.",
  "",
  "Reglas:",
  "1. Responde en español, claro y directo, en 120 palabras como máximo: primero la explicación y, si ayuda, un ejemplo breve.",
  "2. Básate solo en la transcripción. Si no cubre la duda, empieza con «FUERA DE LA LECCIÓN:» y da una orientación general breve (60 palabras como máximo) sin atribuirle nada al instructor.",
  "3. Después de la explicación añade 1 o 2 líneas «CITA: «…»» con frases COPIADAS LITERALMENTE de la transcripción, en su idioma original (sin traducir ni resumir), que respalden la respuesta. Si la duda está fuera de la lección, no pongas citas.",
  "4. Si la duda está dentro de la lección, termina con UNA línea «TARJETA: pregunta || respuesta»: una pregunta de repaso atómica (una sola idea) y su respuesta en 25 palabras como máximo, en español.",
  "5. No hagas preguntas al estudiante, no lo califiques y no uses porcentajes ni minutos del vídeo.",
  "6. Texto plano: puedes usar **negrita** para el término clave y `código` para código. Sin encabezados ni listas largas.",
].join("\n");

function contextBlock(ctx: LessonDoubtContext): string[] {
  const lines: string[] = [];
  if (ctx.kind === "question") {
    lines.push(`La duda surge en esta pregunta de práctica: «${clip(ctx.anchor, 400)}»`);
    if (ctx.studentAnswer?.trim()) lines.push(`Respuesta del estudiante: «${clip(ctx.studentAnswer, 500)}»`);
    if (ctx.feedback?.trim()) lines.push(`Feedback que recibió: «${clip(ctx.feedback, 600)}»`);
  } else if (ctx.kind === "practice") {
    lines.push(`La duda surge en este desafío de aplicación: «${clip(ctx.anchor, 500)}»`);
    if (ctx.studentAnswer?.trim()) lines.push(`Solución del estudiante: «${clip(ctx.studentAnswer, 600)}»`);
    if (ctx.feedback?.trim()) lines.push(`Revisión que recibió: «${clip(ctx.feedback, 600)}»`);
  } else {
    lines.push(`La duda surge al repasar esta idea clave de la lección, tras intentar recordarla: «${clip(ctx.anchor, 400)}»`);
    const others = (ctx.keyConcepts ?? []).filter((concept) => concept !== ctx.anchor).slice(0, 7);
    if (others.length) {
      lines.push("Otras ideas clave de la lección (contexto):");
      for (const concept of others) lines.push(`- ${clip(concept, 220)}`);
    }
  }
  return lines;
}

export function buildDoubtMessages(
  ctx: LessonDoubtContext,
  transcript: DoubtTranscript,
  history: LessonDoubtTurn[],
  question: string,
): AIMessage[] {
  const user: string[] = [
    `Curso: ${ctx.course || "(sin nombre)"}`,
    `Lección: ${ctx.lesson || "(sin nombre)"}`,
  ];
  if (ctx.objective?.trim()) user.push(`Objetivo del estudiante: ${clip(ctx.objective, 240)}`);
  user.push("", ...contextBlock(ctx));
  const previous = history.slice(-2);
  if (previous.length) {
    user.push("", "Conversación previa sobre esta duda:");
    for (const turn of previous) user.push(`Estudiante: ${clip(turn.q, 400)}`, `Tutor: ${clip(turn.answer, 700)}`);
  }
  user.push(
    "",
    `Transcripción de la lección${transcript.truncated ? " (recortada)" : ""}:`,
    '"""',
    transcript.text.slice(0, DOUBT_TRANSCRIPT_CHARS),
    '"""',
    "",
    `Duda del estudiante: ${clip(question, 600)}`,
  );
  return [
    { role: "system", content: SYSTEM_RULES },
    { role: "user", content: user.join("\n") },
  ];
}

// ─── Respaldo local (sin IA) ─────────────────────────────────────────────────
const STOPWORDS = new Set([
  // es
  "que", "como", "para", "por", "con", "una", "uno", "unos", "unas", "los", "las", "del", "les",
  "esto", "esta", "este", "eso", "esa", "ese", "estos", "estas", "aqui", "alli", "hay", "ser", "son", "fue", "era",
  "pero", "porque", "cuando", "donde", "cual", "quien", "mas", "muy", "tan", "sin", "sobre", "entre",
  "entiendo", "entendi", "duda", "dudas", "explica", "explicar", "significa", "decir", "dice", "hace", "hacer",
  "tiene", "tener", "puede", "pueden", "algo", "todo", "nada", "bien", "mal", "leccion", "video",
  // en
  "the", "and", "for", "you", "are", "this", "that", "with", "what", "how", "why", "from", "into",
  "your", "our", "can", "will", "not", "but", "all", "its", "has", "have", "was", "were", "they", "them", "then",
  "there", "here", "which", "who", "when", "where", "does", "did", "just", "also", "about", "more", "most", "some",
]);

function contentTokens(value: string): string[] {
  return normalizeForMatch(value).split(" ").filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

export function splitSentences(text: string): string[] {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25 && sentence.length <= 320);
}

/** Fragmentos de la transcripción que comparten términos con la duda. */
export function localDoubtAnswer(question: string, ctx: LessonDoubtContext, transcript: string): ParsedDoubtAnswer {
  const questionTokens = new Set(contentTokens(question));
  const contextTokens = new Set(contentTokens(`${ctx.anchor} ${(ctx.keyConcepts ?? []).join(" ")}`));
  const ranked = splitSentences(transcript)
    .map((sentence, index) => {
      let score = 0;
      for (const token of new Set(contentTokens(sentence))) {
        if (questionTokens.has(token)) score += 2;
        else if (contextTokens.has(token)) score += 0.5;
      }
      return { sentence, index, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_QUOTES)
    .sort((a, b) => a.index - b.index);
  if (!ranked.length) {
    return {
      answer: "Sin IA disponible ahora, y no encontré en la transcripción fragmentos con los términos de tu duda. Reformúlala con palabras de la lección o vuelve al tramo del video donde surgió.",
      quotes: [],
      outside: true,
      card: null,
    };
  }
  return {
    answer: "Sin IA disponible ahora: estos son los fragmentos de la lección más relacionados con tu duda.",
    quotes: verifyQuotes(ranked.map((item) => item.sentence), transcript),
    outside: false,
    card: null,
  };
}

// ─── Orquestación ─────────────────────────────────────────────────────────────
/** Resultado plano (el repo compila sin "strict": una unión discriminada no se estrecha). */
export interface AskDoubtResult {
  ok: boolean;
  turn?: LessonDoubtTurn;
  error?: string;
  providerError?: string;
  aborted?: boolean;
}

export async function askLessonDoubt(params: {
  ctx: LessonDoubtContext;
  thread?: LessonDoubtThread | null;
  question: string;
  getTranscript: () => Promise<DoubtTranscript | null>;
  /** Solo en desarrollo sin extensión: respuesta de demostración. */
  demoAnswer?: ((question: string) => string | null) | null;
  onPartial?: (visible: { text: string; outside: boolean }) => void;
  signal?: AbortSignal;
}): Promise<AskDoubtResult> {
  const question = params.question.trim();
  if (!question) return { ok: false, error: "Escribe tu duda primero." };
  const transcript = await params.getTranscript().catch(() => null);
  if (params.signal?.aborted) return { ok: false, error: "aborted", aborted: true };
  if (!transcript?.text?.trim()) {
    return { ok: false, error: "No se pudo leer la transcripción de esta lección. Abre el video con los subtítulos disponibles y vuelve a intentarlo." };
  }
  const history = params.thread?.turns ?? [];
  const messages = buildDoubtMessages(params.ctx, transcript, history, question);
  const res = await streamLocalAI(messages, 2000, 0.2, (_token, accumulated) => {
    params.onPartial?.(visibleDoubtText(accumulated));
  }, params.signal, "doubt");
  if (params.signal?.aborted) return { ok: false, error: "aborted", aborted: true };
  // Un mock nunca se presenta como respuesta de IA.
  if (res.success && !res.isMock && res.content.trim()) {
    const parsed = parseDoubtAnswer(res.content, transcript.text);
    if (parsed.answer) return { ok: true, turn: { q: question, ...parsed, source: "ai", at: Date.now() } };
  }
  const demo = params.demoAnswer?.(question) ?? null;
  const parsed = demo
    ? parseDoubtAnswer(demo, transcript.text)
    : localDoubtAnswer(question, params.ctx, transcript.text);
  return { ok: true, turn: { q: question, ...parsed, source: "local", at: Date.now() }, providerError: res.error };
}

// ─── Hilos y tarjetas ─────────────────────────────────────────────────────────
export function appendDoubtTurn(
  thread: LessonDoubtThread | null | undefined,
  ctx: LessonDoubtContext,
  turn: LessonDoubtTurn,
): LessonDoubtThread {
  return {
    id: thread?.id ?? doubtThreadId(ctx.kind, ctx.anchor),
    kind: ctx.kind,
    anchor: thread?.anchor ?? clip(ctx.anchor, 500),
    turns: [...(thread?.turns ?? []), turn].slice(-MAX_DOUBT_TURNS),
    updatedAt: Date.now(),
  };
}

/** Guarda o quita del mazo la tarjeta de una respuesta. */
export function updateDoubtTurn(thread: LessonDoubtThread, at: number, saved: LessonDoubtSaved | null): LessonDoubtThread {
  return { ...thread, turns: thread.turns.map((turn) => (turn.at === at ? { ...turn, saved } : turn)), updatedAt: Date.now() };
}

export function savedDoubtCount(threads: LessonDoubtThread[]): number {
  return threads.reduce((sum, thread) => sum + thread.turns.filter((turn) => turn.saved).length, 0);
}

/** Reemplaza en su sitio (el orden del mazo no salta) o añade al final. */
export function upsertDoubtThread(threads: LessonDoubtThread[], next: LessonDoubtThread): LessonDoubtThread[] {
  const index = threads.findIndex((thread) => thread.id === next.id);
  if (index >= 0) return threads.map((thread, i) => (i === index ? next : thread));
  return [...threads, next].slice(-MAX_THREADS);
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtml(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

/**
 * HTML del vocabulario permitido en el mazo: respuesta en <b> + cita en
 * <blockquote>. La respuesta ya va entera en negrita: un **x** interior
 * anidaría <b> y el paso a Markdown cerraría la negrita en el primer </b>.
 */
export function doubtCardHtml(saved: LessonDoubtSaved): { front: string; back: string } {
  const quote = saved.quote ? `<blockquote>${escapeHtml(saved.quote)}</blockquote>` : "";
  return { front: inlineHtml(saved.front), back: `<p><b>${inlineHtml(saved.back.replace(/\*\*([^*]+)\*\*/g, "$1"))}</b></p>${quote}` };
}

/** Instantánea que se guarda al pulsar «Guardar como tarjeta». */
export function snapshotDoubtCard(turn: LessonDoubtTurn): LessonDoubtSaved | null {
  if (!turn.card) return null;
  return { front: turn.card.front, back: turn.card.back, quote: turn.quotes[0] };
}

// ─── Restauración desde el historial ─────────────────────────────────────────
function asString(value: unknown, max: number): string {
  return typeof value === "string" ? clip(value, max) : "";
}

function asSaved(value: unknown): LessonDoubtSaved | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const front = asString(raw.front, 180);
  const back = asString(raw.back, 260);
  return front && back ? { front, back, quote: asString(raw.quote, 260) || undefined } : null;
}

export function sanitizeStoredDoubts(value: unknown): LessonDoubtThread[] {
  if (!Array.isArray(value)) return [];
  const threads: LessonDoubtThread[] = [];
  for (const item of value.slice(-MAX_THREADS)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const kind = raw.kind === "question" || raw.kind === "practice" || raw.kind === "concepts" ? raw.kind : null;
    const id = asString(raw.id, 80);
    if (!kind || !id) continue;
    const turns = (Array.isArray(raw.turns) ? raw.turns : []).slice(-MAX_DOUBT_TURNS).flatMap((t): LessonDoubtTurn[] => {
      if (!t || typeof t !== "object") return [];
      const turn = t as Record<string, unknown>;
      const q = asString(turn.q, 600);
      const answer = asString(turn.answer, 1400);
      if (!q || !answer || typeof turn.at !== "number") return [];
      const card = asSaved(turn.card);
      return [{
        q,
        answer,
        quotes: (Array.isArray(turn.quotes) ? turn.quotes : []).map((x) => asString(x, 260)).filter(Boolean).slice(0, MAX_QUOTES),
        outside: Boolean(turn.outside),
        card: card ? { front: card.front, back: card.back } : null,
        source: turn.source === "ai" ? "ai" : "local",
        at: turn.at,
        saved: asSaved(turn.saved),
      }];
    });
    if (!turns.length) continue;
    threads.push({ id, kind, anchor: asString(raw.anchor, 500), turns, updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0 });
  }
  // Al restaurar también se respetan el tope y la unicidad de las tarjetas
  // (se conservan las primeras guardadas).
  const keptFronts = new Set<string>();
  return threads.map((thread) => ({
    ...thread,
    turns: thread.turns.map((turn) => {
      if (!turn.saved) return turn;
      const key = cardFrontKey(turn.saved.front);
      if (keptFronts.size >= MAX_DOUBT_CARDS || keptFronts.has(key)) return { ...turn, saved: null };
      keptFronts.add(key);
      return turn;
    }),
  }));
}
