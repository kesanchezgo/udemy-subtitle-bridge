/**
 * Gemini API key configuration.
 *
 * Stores keys in chrome.storage.local under the `usg_` prefix so they
 * survive service-worker restarts and are available to both the
 * background script and the sidebar UI.
 */

const STORAGE_KEY = 'usg_gemini_api_keys';
const STORAGE_MODEL_KEY = 'usg_gemini_model';

type GeminiGlobal = typeof globalThis & {
  USB_GEMINI_API_KEYS?: string[];
  USB_GEMINI_MODEL?: string;
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
      if (Array.isArray(keys) && keys.length > 0) {
        g.USB_GEMINI_API_KEYS = keys.filter(Boolean).map(String);
      }

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
  const filtered = apiKeys.filter(Boolean);
  g.USB_GEMINI_API_KEYS = filtered;

  if (model) {
    g.USB_GEMINI_MODEL = model.trim();
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
  g.USB_GEMINI_API_KEYS = apiKeys.filter(Boolean);
  if (model) {
    g.USB_GEMINI_MODEL = model.trim();
  }
}

/**
 * Return how many Gemini API keys are currently loaded in memory.
 */
export function getConfiguredKeyCount(): number {
  const g = globalThis as GeminiGlobal;
  return Array.isArray(g.USB_GEMINI_API_KEYS)
    ? g.USB_GEMINI_API_KEYS.filter(Boolean).length
    : 0;
}
