/** The provider keeps a client's metadata as JSON text on SQLite and as an object elsewhere; this reads either. */
export function parseMetadata(value: unknown): Record<string, unknown> {
  let current = value;
  for (let i = 0; i < 2 && typeof current === 'string'; i++) {
    try {
      current = JSON.parse(current);
    } catch {
      return {};
    }
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {};
}
