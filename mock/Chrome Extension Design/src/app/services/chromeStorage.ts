// ─── Chrome Storage Abstraction ──────────────────────────────────────────────
// In a real Chrome Extension  → uses chrome.storage.sync
// In this browser preview     → falls back to localStorage + custom events
//
// All keys are prefixed with "usb_" (Udemy Subtitle Bridge) to avoid conflicts.

const PREFIX = "usb_";

type StorageData = Record<string, unknown>;

function isChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome?.storage?.sync?.get === "function"
  );
}

export const chromeStorage = {
  /** Retrieve one or more persisted values by key */
  async get(keys: string[]): Promise<StorageData> {
    if (isChromeStorage()) {
      return new Promise((resolve) =>
        chrome.storage.sync.get(keys, (result) => resolve(result as StorageData))
      );
    }
    // ── localStorage fallback ─────────────────────────────────────────────────
    const result: StorageData = {};
    for (const k of keys) {
      const raw = localStorage.getItem(PREFIX + k);
      if (raw !== null) {
        try {
          result[k] = JSON.parse(raw);
        } catch {
          result[k] = raw;
        }
      }
    }
    return result;
  },

  /** Persist one or more key-value pairs */
  async set(items: StorageData): Promise<void> {
    if (isChromeStorage()) {
      return new Promise((resolve) => chrome.storage.sync.set(items, resolve));
    }
    // ── localStorage fallback ─────────────────────────────────────────────────
    for (const [k, v] of Object.entries(items)) {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
    }
    // Notify other hook instances in the same tab
    window.dispatchEvent(
      new CustomEvent("usb_storage_change", { detail: items })
    );
  },

  /** Subscribe to external storage changes (returns unsubscribe fn) */
  onChange(callback: (changes: StorageData) => void): () => void {
    if (isChromeStorage()) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>
      ) => {
        const flat: StorageData = {};
        for (const [k, v] of Object.entries(changes)) {
          flat[k] = v.newValue;
        }
        callback(flat);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
    // ── Custom-event fallback ─────────────────────────────────────────────────
    const handler = (e: Event) =>
      callback((e as CustomEvent<StorageData>).detail);
    window.addEventListener("usb_storage_change", handler);
    return () => window.removeEventListener("usb_storage_change", handler);
  },
};
