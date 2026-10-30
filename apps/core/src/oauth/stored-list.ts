/**
 * A list the provider stored: an array on PostgreSQL, and JSON text on SQLite and sqld, which its adapter writes as a JSON string
 * of a JSON string. Text is read until it is a list; anything that is not one is no list.
 */
export function storedList(value: unknown): string[] {
  let list: unknown = value;
  for (let step = 0; step < 3 && typeof list === 'string'; step += 1) {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string') : [];
}
