import { useEffect, useState } from 'react';
import { readStorageValue, writeStorageValue } from '../services/chromeStorage';

export function usePersistedState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    readStorageValue<T>(key)
      .then((storedValue) => {
        if (!mounted) {
          return;
        }
        if (storedValue !== undefined) {
          setValue(storedValue);
        }
        setReady(true);
      })
      .catch(() => {
        if (mounted) {
          setReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [key]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void writeStorageValue(key, value);
  }, [key, ready, value]);

  return [value, setValue, ready] as const;
}