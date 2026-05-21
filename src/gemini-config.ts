/**
 * Gemini API key configuration.
 *
 * Stores keys in chrome.storage.local under the `usg_` prefix so they
 * survive service-worker restarts and are available to both the
 * background script and the sidebar UI.
 */

const STORAGE_KEY = 'usg_gemini_api_keys';
const STORAGE_MODEL_KEY = 'usg_gemini_model';
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

type GeminiGlobal = typeof globalThis & {
  USB_GEMINI_API_KEYS?: string[];
  USB_GEMINI_MODEL?: string;
};

type GeminiKeyValidationStatus = 'valid' | 'rate-limited' | 'invalid' | 'error';

type GeminiKeyValidationResult = {
  status: GeminiKeyValidationStatus;
  error?: string;
};

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

export function normalizeGeminiKeys(apiKeys: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const apiKey of apiKeys) {
    const trimmed = String(apiKey || '').trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function buildGeminiGenerateContentUrl(model: string, apiKey?: string): string {
  const baseUrl = `${GEMINI_API_URL}/${encodeURIComponent(model)}:generateContent`;
  const normalizedKey = String(apiKey || '').trim();
  return normalizedKey ? `${baseUrl}?key=${encodeURIComponent(normalizedKey)}` : baseUrl;
}

export function buildGeminiStreamContentUrl(model: string, apiKey?: string): string {
  const normalizedKey = String(apiKey || '').trim();
  const keyQuery = normalizedKey ? `&key=${encodeURIComponent(normalizedKey)}` : '';
  return `${GEMINI_API_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse${keyQuery}`;
}

/**
 * Load Gemini API keys from chrome.storage.local and place them on
 * globalThis so that localAI.ts and background.ts can read them.
 */
export async function initGeminiKeys(): Promise<void> {
  const storage = getChromeStorage();
  if (!storage) {
    return;
  }

  return new Promise<void>((resolve) => {
    storage.get([STORAGE_KEY, STORAGE_MODEL_KEY], (result) => {
      const g = globalThis as GeminiGlobal;

      const keys = result[STORAGE_KEY];
      g.USB_GEMINI_API_KEYS = Array.isArray(keys)
        ? normalizeGeminiKeys(keys.map(String))
        : [];

      const model = result[STORAGE_MODEL_KEY];
      if (typeof model === 'string' && model.trim()) {
        g.USB_GEMINI_MODEL = model.trim();
      }

      resolve();
    });
  });
}

/**
 * Persist Gemini API keys to chrome.storage.local and update globalThis.
 */
export async function saveGeminiKeys(
  apiKeys: string[],
  model?: string
): Promise<void> {
  const g = globalThis as GeminiGlobal;
  const filtered = normalizeGeminiKeys(apiKeys);
  g.USB_GEMINI_API_KEYS = filtered;

  const normalizedModel = model?.trim();
  if (normalizedModel) {
    g.USB_GEMINI_MODEL = normalizedModel;
  }

  const storage = getChromeStorage();
  if (!storage) {
    return;
  }

  return new Promise<void>((resolve) => {
    const data: Record<string, unknown> = { [STORAGE_KEY]: filtered };
    if (model) {
      data[STORAGE_MODEL_KEY] = model.trim();
    }
    storage.set(data, () => resolve());
  });
}

/**
 * Synchronously set keys on globalThis (for immediate use before
 * storage round-trip completes).
 */
export function setGeminiKeysSync(
  apiKeys: string[],
  model?: string
): void {
  const g = globalThis as GeminiGlobal;
  g.USB_GEMINI_API_KEYS = normalizeGeminiKeys(apiKeys);
  const normalizedModel = model?.trim();
  if (normalizedModel) {
    g.USB_GEMINI_MODEL = normalizedModel;
  }
}

/**
 * Return how many Gemini API keys are currently loaded in memory.
 */
export function getConfiguredKeyCount(): number {
  const g = globalThis as GeminiGlobal;
  return Array.isArray(g.USB_GEMINI_API_KEYS)
    ? normalizeGeminiKeys(g.USB_GEMINI_API_KEYS).length
    : 0;
}

/**
 * Validate a Gemini API key by making a minimal test request.
 * Returns { valid: true } if the key is active, or { valid: false, error: string } if not.
 */
export async function validateGeminiKey(apiKey: string): Promise<GeminiKeyValidationResult> {
  const normalizedKey = String(apiKey || '').trim();

  if (!normalizedKey) {
    return { status: 'invalid', error: 'La key está vacía.' };
  }

  try {
    const response = await fetch(buildGeminiGenerateContentUrl(GEMINI_DEFAULT_MODEL, normalizedKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Responde solo "ok".' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4 }
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 400 || response.status === 403) {
        return { status: 'invalid', error: `Key inválida o sin permisos (HTTP ${response.status}).` };
      }
      if (response.status === 429) {
        return { status: 'rate-limited', error: 'Key activa pero con rate limit excedido. Intenta más tarde.' };
      }
      return { status: 'error', error: `Error HTTP ${response.status}: ${text.slice(0, 120)}` };
    }

    return { status: 'valid' };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}
