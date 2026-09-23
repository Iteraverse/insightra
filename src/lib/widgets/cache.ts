// Tab-scoped, bounded display cache. Never stores credentials.
const memory = new Map<string, unknown>();
const prefix = 'insightra-preview-v1:';
export function cached<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = sessionStorage.getItem(prefix + key);
    if (raw) {
      const value = JSON.parse(raw);
      memory.set(key, value);
      return value;
    }
  } catch {}
}
export function remember(key: string, value: unknown) {
  memory.delete(key);
  memory.set(key, value);
  if (memory.size > 24) memory.delete(memory.keys().next().value!);
  try {
    const text = JSON.stringify(value);
    if (text.length < 2200000) sessionStorage.setItem(prefix + key, text);
  } catch {
    /* Quota unavailable: memory cache remains usable. */
  }
}
export function fuzzyMatch(text: string, query: string) {
  const hay = text.normalize('NFKC').toLowerCase();
  return query
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((term) => {
      let at = 0;
      for (const char of term) {
        at = hay.indexOf(char, at);
        if (at < 0) return false;
        at++;
      }
      return true;
    });
}
