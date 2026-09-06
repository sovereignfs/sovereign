/**
 * Parse a `?page=` query value into a 1-based page number. `Number('abc')` is
 * `NaN`, and `Math.max(1, NaN)` is still `NaN` — which used to render
 * "Showing NaN–NaN" and send `offset=NaN` to the activity API. Anything that
 * is not a finite integer ≥ 1 falls back to page 1.
 */
export function parsePageParam(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.trunc(n));
}
