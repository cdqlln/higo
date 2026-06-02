export function uid(prefix = ""): string {
  const r = Math.random().toString(36).slice(2, 9);
  const t = Date.now().toString(36).slice(-5);
  return prefix ? `${prefix}_${t}${r}` : `${t}${r}`;
}
