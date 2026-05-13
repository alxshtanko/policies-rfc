import { useEffect, useState } from 'react';

/**
 * localStorage-backed equivalent of the cursor/canvas useCanvasState hook.
 * Persists the value under the given key so interactive controls survive
 * page reloads — same UX as the in-IDE canvas behavior.
 */
export function useCanvasState<T>(
  key: string,
  defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const storageKey = `canvas-state:${key}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw === null ? defaultValue : (JSON.parse(raw) as T);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  }, [storageKey, value]);

  return [value, setValue];
}
