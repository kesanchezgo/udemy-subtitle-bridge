import { useEffect } from "react";

type KeyMap = {
  [key: string]: (e: KeyboardEvent) => void;
};

export function useHotkeys(keyMap: KeyMap) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      // Don't trigger if user is typing in an input or textarea
      if (
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        !!activeEl?.isContentEditable
      ) {
        return;
      }

      const keyCombo = [
        e.ctrlKey ? "ctrl" : "",
        e.shiftKey ? "shift" : "",
        e.altKey ? "alt" : "",
        e.key.toLowerCase(),
      ]
        .filter(Boolean)
        .join("+");

      const key = e.key.toLowerCase();

      // Check both exact combo and just the key
      if (keyMap[keyCombo]) {
        e.preventDefault();
        keyMap[keyCombo](e);
      } else if (keyMap[key]) {
        e.preventDefault();
        keyMap[key](e);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyMap]);
}
