import { useEffect, useRef } from 'react';

type HotkeyMap = Record<string, () => void>;

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function matchesHotkey(event: KeyboardEvent, hotkey: string) {
  const parts = hotkey.split('+').map(normalizeKey);
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  if (modifiers.has('alt') !== event.altKey) return false;
  if (modifiers.has('shift') !== event.shiftKey) return false;
  if (modifiers.has('ctrl') !== event.ctrlKey) return false;
  if (modifiers.has('meta') !== event.metaKey) return false;

  return normalizeKey(event.key) === key;
}

function shouldIgnoreTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useHotkeys(bindings: HotkeyMap) {
  const bindingsRef = useRef(bindings);

  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreTarget(event.target)) {
        return;
      }

      for (const [hotkey, callback] of Object.entries(bindingsRef.current)) {
        if (matchesHotkey(event, hotkey)) {
          event.preventDefault();
          callback();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}