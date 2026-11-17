/** An index scan, not `/\/+$/`: an anchored quantifier is quadratic on a long run of slashes. */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}
