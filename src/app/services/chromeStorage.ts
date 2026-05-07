function getChromeStorageArea() {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: any }).chrome;
  return chromeApi?.storage?.sync ?? null;
}

function getFallbackStorage() {
  return globalThis.localStorage;
}

export async function readStorageValue<T>(key: string): Promise<T | undefined> {
  const storage = getChromeStorageArea();
  if (storage) {
    return await new Promise<T | undefined>((resolve) => {
      storage.get([key], (items: Record<string, T>) => {
        resolve(items[key]);
      });
    });
  }

  const rawValue = getFallbackStorage().getItem(key);
  if (!rawValue) {
    return undefined;
  }

  return JSON.parse(rawValue) as T;
}

export async function writeStorageValue<T>(key: string, value: T): Promise<void> {
  const storage = getChromeStorageArea();
  if (storage) {
    await new Promise<void>((resolve) => {
      storage.set({ [key]: value }, () => resolve());
    });
    return;
  }

  getFallbackStorage().setItem(key, JSON.stringify(value));
}

export async function removeStorageValue(key: string): Promise<void> {
  const storage = getChromeStorageArea();
  if (storage) {
    await new Promise<void>((resolve) => {
      storage.remove(key, () => resolve());
    });
    return;
  }

  getFallbackStorage().removeItem(key);
}