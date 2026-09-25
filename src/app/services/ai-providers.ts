/**
 * Multi-provider AI transport configuration.
 *
 * Generalizes the previous Gemini-only wiring. Four provider kinds are
 * supported, all consumed through the same OpenAI-style message array:
 *
 *   - "local"      → the bundled local server (127.0.0.1:8010, OpenAI-compatible)
 *   - "openai"     → any OpenAI-compatible endpoint: OpenAI, DeepSeek, Groq,
 *                    OpenRouter, LM Studio, Ollama, or a self-hosted proxy such
 *                    as `http://127.0.0.1:6660/v1`
 *   - "anthropic"  → api.anthropic.com Messages API
 *   - "gemini"     → Google Generative Language API (native, multi-key)
 *
 * Storage lives in chrome.storage.local under `usg_ai_*` keys. Runtime copies
 * are mirrored on globalThis so the background service worker and the sidebar
 * can read the config without a storage round-trip on every call.
 */

export type AiProviderKind = 'local' | 'openai' | 'anthropic' | 'gemini';

export interface AiProviderConfig {
  /** Which transport to use for chat/generate calls. */
  kind: AiProviderKind;
  /** Base URL WITHOUT the trailing `/chat/completions` etc. See DEFAULT_BASE_URLS. */
  baseUrl: string;
  /** API key / bearer token. Sent as `Authorization: Bearer <apiKey>` when set. */
  apiKey: string;
  /** Model id, e.g. `muse-spark-1.3-contributor-free`, `gpt-4o`, `claude-3-5-sonnet`. */
  model: string;
}

export const AI_PROVIDER_STORAGE_KEY = 'usg_ai_provider_config';

type AiProviderGlobal = typeof globalThis & {
  USB_AI_PROVIDER?: AiProviderConfig;
};

export const DEFAULT_BASE_URLS: Record<AiProviderKind, string> = {
  local: 'http://127.0.0.1:8010/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

export const DEFAULT_MODELS: Record<AiProviderKind, string> = {
  local: 'local-model',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-2.5-flash',
};

export const PROVIDER_LABELS: Record<AiProviderKind, string> = {
  local: 'IA local (8010)',
  openai: 'OpenAI-compatible',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};

const PROVIDER_KINDS: AiProviderKind[] = ['local', 'openai', 'anthropic', 'gemini'];

export function isAiProviderKind(value: unknown): value is AiProviderKind {
  return typeof value === 'string' && (PROVIDER_KINDS as string[]).includes(value);
}

/** Trim, strip a trailing slash, and drop an accidental /chat/completions suffix. */
export function normalizeBaseUrl(rawUrl: string, kind: AiProviderKind): string {
  let url = String(rawUrl || '').trim();
  if (!url) return DEFAULT_BASE_URLS[kind];
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/(chat\/completions|messages|models)$/i, '');
  return url || DEFAULT_BASE_URLS[kind];
}

export function normalizeAiProviderConfig(
  partial: Partial<AiProviderConfig> | null | undefined,
): AiProviderConfig {
  const kind: AiProviderKind = isAiProviderKind(partial?.kind)
    ? (partial!.kind as AiProviderKind)
    : 'local';
  return {
    kind,
    baseUrl: normalizeBaseUrl(String(partial?.baseUrl ?? ''), kind),
    apiKey: String(partial?.apiKey ?? '').trim(),
    model: String(partial?.model ?? '').trim() || DEFAULT_MODELS[kind],
  };
}

export function getAiProviderConfig(): AiProviderConfig {
  const g = globalThis as AiProviderGlobal;
  return normalizeAiProviderConfig(g.USB_AI_PROVIDER);
}

export function setAiProviderConfigSync(partial: Partial<AiProviderConfig>): AiProviderConfig {
  const g = globalThis as AiProviderGlobal;
  const merged = normalizeAiProviderConfig({ ...(g.USB_AI_PROVIDER ?? {}), ...partial });
  g.USB_AI_PROVIDER = merged;
  return merged;
}

type ChromeStorageLocal = {
  get: (keys: string[], cb: (result: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, cb?: () => void) => void;
};

function getChromeStorage(): ChromeStorageLocal | undefined {
  const chromeApi = (
    globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: ChromeStorageLocal } };
    }
  ).chrome;
  return chromeApi?.storage?.local;
}

// localStorage fallback so the provider config persists in preview/dev where the
// chrome.storage API is absent. Uses the same `usb_local_` namespace as
// chromeLocalStorage so both layers stay in sync.
const LOCAL_FALLBACK_PREFIX = 'usb_local_';

function readFallback(): Partial<AiProviderConfig> | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LOCAL_FALLBACK_PREFIX + AI_PROVIDER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<AiProviderConfig>;
  } catch {
    return null;
  }
}

function writeFallback(config: AiProviderConfig): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_FALLBACK_PREFIX + AI_PROVIDER_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Load the persisted provider config into globalThis. Safe to call repeatedly. */
export async function initAiProviderConfig(): Promise<AiProviderConfig> {
  const storage = getChromeStorage();
  if (!storage) {
    // Preview/dev: read the localStorage fallback first so a saved provider
    // survives reloads.
    const stored = readFallback();
    const merged = normalizeAiProviderConfig({ ...getAiProviderConfig(), ...(stored ?? {}) });
    (globalThis as AiProviderGlobal).USB_AI_PROVIDER = merged;
    return merged;
  }

  return new Promise<AiProviderConfig>((resolve) => {
    try {
      storage.get([AI_PROVIDER_STORAGE_KEY], (result) => {
        const stored = result[AI_PROVIDER_STORAGE_KEY] as Partial<AiProviderConfig> | undefined;
        const merged = normalizeAiProviderConfig({ ...getAiProviderConfig(), ...(stored ?? {}) });
        (globalThis as AiProviderGlobal).USB_AI_PROVIDER = merged;
        resolve(merged);
      });
    } catch {
      resolve(getAiProviderConfig());
    }
  });
}

export async function saveAiProviderConfig(
  partial: Partial<AiProviderConfig>,
): Promise<AiProviderConfig> {
  const config = setAiProviderConfigSync(partial);
  const storage = getChromeStorage();
  if (!storage) {
    writeFallback(config);
    return config;
  }

  return new Promise<AiProviderConfig>((resolve) => {
    try {
      storage.set({ [AI_PROVIDER_STORAGE_KEY]: config }, () => {
        // Mirror to localStorage too so the content-script preview stays warm.
        writeFallback(config);
        resolve(config);
      });
    } catch {
      writeFallback(config);
      resolve(config);
    }
  });
}

export type ProviderValidationStatus = 'ok' | 'missing_fields' | 'bad_url' | 'unreachable' | 'http_error';

export interface ProviderValidationResult {
  status: ProviderValidationStatus;
  message: string;
  httpStatus?: number;
}

/**
 * Actually exercise the provider config: validate the URL, then send a minimal
 * chat request and confirm a usable response. Used before saving so an
 * unusable config is rejected instead of silently failing on the next job.
 */
export async function validateProviderConfig(
  config: AiProviderConfig,
  options: { timeoutMs?: number } = {},
): Promise<ProviderValidationResult> {
  const cfg = normalizeAiProviderConfig(config);

  if (!cfg.baseUrl) {
    return { status: 'missing_fields', message: 'Falta la Base URL.' };
  }
  if (cfg.kind !== 'local' && !cfg.apiKey) {
    return { status: 'missing_fields', message: 'Falta la API key.' };
  }
  if (!cfg.model) {
    return { status: 'missing_fields', message: 'Falta el nombre del modelo.' };
  }

  try {
    // Reject obviously malformed URLs early with a clear message.
    const parsed = new URL(cfg.baseUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return { status: 'bad_url', message: 'La Base URL debe empezar por http:// o https://.' };
    }
  } catch {
    return { status: 'bad_url', message: 'La Base URL no es válida.' };
  }

  // Inside the extension, the probe MUST run in the service worker: a fetch to a
  // local or third-party host from the content script's isolated world is subject
  // to CORS and is aborted before it completes, whereas the service worker has
  // host permissions and is exempt. If delegation is possible we never fall back
  // to a direct fetch — that path can only fail and would report a misleading
  // "server not running" error for a server that is running fine.
  const delegation = await validateViaBackground(cfg);
  if (delegation.attempted) return delegation.result;

  // Preview / no-extension fallback: validate directly.
  return validateDirectly(cfg, options);
}

interface DelegationOutcome {
  /** True when the message was actually sent to the background (extension context). */
  attempted: boolean;
  /** Present whenever `attempted` is true — success or a truthful failure. */
  result: ProviderValidationResult | null;
}

/**
 * The background parks validation results here. Polling this is what makes the
 * probe reliable: MV3 may tear the service worker down mid-fetch, which kills
 * the message port, but the result still lands in storage once the fetch
 * settles (or the worker is restarted and replays it).
 */
const VALIDATION_RESULT_KEY = 'usg_provider_validation';

function readValidationResult(requestId: string): Promise<{ status?: string; message?: string; httpStatus?: number } | null> {
  return new Promise((resolve) => {
    try {
      const chromeApi = (globalThis as typeof globalThis & {
        chrome?: { storage?: { local?: { get: (k: string[], cb: (r: Record<string, unknown>) => void) => void } } };
      }).chrome;
      const getter = chromeApi?.storage?.local?.get;
      if (typeof getter !== 'function') { resolve(null); return; }

      getter.call(chromeApi!.storage!.local, [VALIDATION_RESULT_KEY], (res) => {
        const stored = res?.[VALIDATION_RESULT_KEY] as
          | { requestId?: string; status?: string; message?: string; httpStatus?: number }
          | undefined;
        resolve(stored && stored.requestId === requestId ? stored : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Ask the service worker to probe the provider. Returns `attempted: false` only
 * when there is no background to talk to (preview/dev), which is the one case
 * where the caller may fall back to a direct fetch.
 */
function validateViaBackground(cfg: AiProviderConfig): Promise<DelegationOutcome> {
  return new Promise((resolve) => {
    try {
      const chromeApi = (globalThis as typeof globalThis & {
        chrome?: { runtime?: { sendMessage?: (msg: unknown, cb: (res: unknown) => void) => void; lastError?: { message?: string } } };
      }).chrome;
      if (typeof chromeApi?.runtime?.sendMessage !== 'function') {
        resolve({ attempted: false, result: null });
        return;
      }

      const requestId = `v${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      let settled = false;
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let hardStop: ReturnType<typeof setTimeout> | null = null;

      const finish = (result: ProviderValidationResult) => {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (hardStop) clearTimeout(hardStop);
        resolve({ attempted: true, result });
      };

      const acceptIfFinal = (value: { status?: string; message?: string; httpStatus?: number } | null) => {
        if (!value) return false;
        if (typeof value.status !== 'string' || typeof value.message !== 'string') return false;
        if (value.status === 'pending') return false;
        finish({
          status: value.status as ProviderValidationStatus,
          message: value.message,
          httpStatus: typeof value.httpStatus === 'number' ? value.httpStatus : undefined,
        });
        return true;
      };

      // Poll storage for the outcome. This is the primary path: it survives the
      // message port closing when the worker is torn down mid-probe. Each tick
      // also pings the worker, which resets its idle-shutdown timer so a slow
      // provider cannot outlive the service worker.
      pollTimer = setInterval(async () => {
        if (settled) return;
        try { chromeApi.runtime?.sendMessage?.({ type: 'USG_KEEPALIVE' }, () => { void chromeApi.runtime?.lastError; }); } catch { /* ignore */ }
        const stored = await readValidationResult(requestId);
        if (stored?.status === 'pending') pendingSeen = true;
        // MV3 wake race: a runtime message sent while the service worker is
        // tearing down is dropped SILENTLY ("message port closed"), which left
        // the probe without a verdict until the hardstop. On heavy pages the
        // worker can take several seconds to wake, so keep re-sending the
        // probe message every ~2.5 s until it acknowledges ('pending' stamp)
        // or the validation window closes.
        const sinceStart = Date.now() - startedAt;
        if (!pendingSeen && sinceStart > 2500 && sinceStart < 38000 && pollTick % 4 === 3) {
          try {
            chromeApi.runtime?.sendMessage?.({ type: 'USG_VALIDATE_PROVIDER', config: cfg, requestId }, () => {
              void chromeApi.runtime?.lastError;
            });
          } catch { /* ignore — retried on a later tick */ }
        }
        pollTick += 1;
        acceptIfFinal(stored);
      }, 700);

      const startedAt = Date.now();
      let pendingSeen = false;
      let pollTick = 0;
      chromeApi.runtime.sendMessage({ type: 'USG_VALIDATE_PROVIDER', config: cfg, requestId }, async (response) => {
        // lastError is expected on a torn-down worker; storage polling covers it.
        const lastErr = chromeApi.runtime?.lastError;
        if (lastErr) {
          try {
            (document.documentElement as HTMLElement & { dataset: DOMStringMap }).dataset.usbQaValidateError =
              String((lastErr as { message?: string }).message || 'unknown').slice(0, 120);
          } catch { /* QA breadcrumb only */ }
        }
        const res = response as { status?: string; message?: string; httpStatus?: number } | undefined;
        if (acceptIfFinal(res ?? null)) return;

        // If the background answered synchronously with a final verdict we are
        // done; otherwise check storage once in case it beat the poll.
        acceptIfFinal(await readValidationResult(requestId));
      });

      // Backstop. The background probe allows 25s and may start late on a
      // heavy page (wake retries), so this sits well above both.
      hardStop = setTimeout(async () => {
        if (acceptIfFinal(await readValidationResult(requestId))) return;
        finish({ status: 'unreachable', message: 'La validación no respondió a tiempo. Verifica que el servidor esté corriendo.' });
      }, 75000);
    } catch {
      resolve({ attempted: false, result: null });
    }
  });
}

async function validateDirectly(
  cfg: AiProviderConfig,
  options: { timeoutMs?: number },
): Promise<ProviderValidationResult> {
  const controller = new AbortController();
  // Generous timeout: some local proxies/models take 10-15s to answer even a
  // tiny prompt (cold start, queued inference). Too short a timeout would reject
  // a working provider.
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);

  try {
    const messages = [{ role: 'user' as const, content: 'Responde solo: ok' }];
    const body =
      cfg.kind === 'anthropic'
        ? buildAnthropicBody(messages, 8, 0, cfg.model, false)
        : buildOpenAiCompatibleBody(messages, 8, 0, cfg.model, false);

    const response = await fetch(buildProviderChatUrl(cfg, false), {
      method: 'POST',
      headers: buildProviderHeaders(cfg),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      const hint = response.status === 401 || response.status === 403
        ? 'API key rechazada o sin permisos.'
        : response.status === 404
          ? 'El endpoint o el modelo no existe en ese servidor.'
          : text.slice(0, 160);
      return {
        status: 'http_error',
        httpStatus: response.status,
        message: `El servidor respondió HTTP ${response.status}. ${hint}`,
      };
    }

    const content = extractProviderText(JSON.parse(text), cfg.kind);
    if (!content) {
      return { status: 'http_error', message: 'El servidor respondió pero sin contenido utilizable (¿modelo incorrecto?).' };
    }

    return { status: 'ok', message: `Conexión correcta (${cfg.kind} · ${cfg.model}).` };
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    if (isAbort) {
      return { status: 'unreachable', message: 'El servidor no respondió a tiempo (timeout). ¿Está encendido?' };
    }
    const host = (() => { try { return new URL(cfg.baseUrl).host; } catch { return cfg.baseUrl; } })();
    return {
      status: 'unreachable',
      message: `No se pudo contactar ${host}. Verifica que el servidor esté corriendo y que el permiso del host esté concedido (reinstala la extensión desde dist/ si añadiste el host después).`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── URL + payload builders ──────────────────────────────────────────────────

/**
 * Chat completions URL. Both `openai` and `local` speak the OpenAI wire format;
 * `anthropic` and `gemini` have their own paths.
 */
export function buildProviderChatUrl(config: AiProviderConfig, stream: boolean): string {
  const base = normalizeBaseUrl(config.baseUrl, config.kind);
  switch (config.kind) {
    case 'anthropic':
      return `${base}/messages`;
    case 'gemini': {
      // Native Gemini needs the API key as a query param and an SSE alt for streams.
      const suffix = stream ? ':streamGenerateContent?alt=sse' : ':generateContent';
      const key = config.apiKey ? `${stream ? '&' : '?'}key=${encodeURIComponent(config.apiKey)}` : '';
      return `${base}/models/${encodeURIComponent(config.model)}${suffix}${key}`;
    }
    case 'local':
    case 'openai':
    default:
      return `${base}/chat/completions`;
  }
}

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Request headers per provider. OpenAI-compatible uses bearer auth. */
export function buildProviderHeaders(config: AiProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  switch (config.kind) {
    case 'anthropic':
      if (config.apiKey) headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      // Allow direct browser-context calls (the extension's content script origin).
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      break;
    case 'gemini':
      // Key travels in the query string for Gemini.
      break;
    case 'local':
    case 'openai':
    default:
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
  }
  return headers;
}

/**
 * Body for the OpenAI-compatible providers (local + openai). This is the same
 * shape the local 8010 server already accepted.
 */
export function buildOpenAiCompatibleBody(
  messages: OpenAiChatMessage[],
  maxTokens: number | undefined,
  temperature: number,
  model: string,
  stream: boolean,
): Record<string, unknown> {
  // max_tokens undefined se omite del body: los modelos de razonamiento
  // (p. ej. rutas gemini vía cline-free) pueden colgarse con topes bajísimos.
  return {
    model,
    messages,
    temperature,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    stream,
  };
}

/**
 * Anthropic Messages API body. System messages are hoisted into the top-level
 * `system` field; the rest become `messages`.
 */
export function buildAnthropicBody(
  messages: OpenAiChatMessage[],
  maxTokens: number,
  temperature: number,
  model: string,
  stream: boolean,
): Record<string, unknown> {
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n');

  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: turns.length ? turns : [{ role: 'user', content: systemText || 'Responde en español.' }],
    stream,
  };
  if (systemText) body.system = systemText;
  return body;
}

// ─── Response extraction ─────────────────────────────────────────────────────

/** Pull the assistant text out of a non-streaming response, per provider. */
export function extractProviderText(data: unknown, kind: AiProviderKind): string {
  const obj = data as Record<string, unknown> | null | undefined;
  if (!obj) return '';

  if (kind === 'anthropic') {
    const blocks = obj.content as Array<{ type?: string; text?: unknown }> | undefined;
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => String(b.text))
        .join('')
        .trim();
    }
    return '';
  }

  if (kind === 'gemini') {
    const parts = (obj.candidates as Array<{ content?: { parts?: Array<{ text?: unknown }> } }> | undefined)?.[0]
      ?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim();
  }

  // OpenAI-compatible: choices[0].message.content (or the legacy .text).
  const choice = (obj.choices as Array<{ message?: { content?: unknown }; text?: unknown }> | undefined)?.[0];
  const content = choice?.message?.content ?? choice?.text;
  return typeof content === 'string' ? content.trim() : '';
}

/** Pull a streaming delta token out of one SSE `data:` payload, per provider. */
export function extractProviderStreamToken(payload: string, kind: AiProviderKind): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return '';
  }
  const obj = parsed as Record<string, unknown>;

  if (kind === 'anthropic') {
    // content_block_delta → { delta: { type: "text_delta", text } }
    const delta = obj.delta as { type?: string; text?: unknown } | undefined;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') return delta.text;
    return '';
  }

  if (kind === 'gemini') {
    return extractProviderText(obj, 'gemini');
  }

  // OpenAI-compatible: choices[0].delta.content
  const choice = (obj.choices as Array<{ delta?: { content?: unknown } }> | undefined)?.[0];
  const content = choice?.delta?.content;
  return typeof content === 'string' ? content : '';
}
