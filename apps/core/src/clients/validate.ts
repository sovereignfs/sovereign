import { OAUTH_SCOPES } from '../oauth/provider';

/** One thing wrong with what was entered, said so a form can put it beside the field. */
export type Problem = { field: string; message: string };

const MAX_URIS = 20;
const MAX_URL_LENGTH = 2048;
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * An address an app may be sent to or told at (core-app §3.7.1): `https`, or `http` on `localhost` and
 * `*.localhost` only on a development instance, which is one whose own address (`SV_URL`) is `http`. No
 * credentials, no fragment, no wildcard, and nothing the browser would read differently from how it is
 * written. Returns what is wrong, or nothing.
 */
export function urlProblem(value: unknown, development: boolean): string | undefined {
  if (typeof value !== 'string' || value === '') return 'is required';
  if (value.length > MAX_URL_LENGTH) return 'is too long';
  if (value !== value.trim() || CONTROL.test(value) || value.includes('*')) {
    return 'is not a plain address';
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'is not an address';
  }
  if (url.username !== '' || url.password !== '') return 'must not contain a user name or password';
  if (value.includes('#')) return 'must not contain a fragment';
  if (url.protocol === 'https:') return undefined;
  if (url.protocol === 'http:') {
    const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost');
    if (development && local) return undefined;
    return development
      ? 'must be https, or http on localhost'
      : 'must be https: this instance is not a development instance';
  }
  return 'must be https';
}

/** A list of addresses: how many, each one valid, none twice. */
export function urlListProblems(
  field: string,
  value: unknown,
  development: boolean,
  options: { required: boolean },
): { problems: Problem[]; list: string[] } {
  if (value === undefined || value === null) {
    return {
      problems: options.required ? [{ field, message: 'at least one address is needed' }] : [],
      list: [],
    };
  }
  if (!Array.isArray(value)) return { problems: [{ field, message: 'must be a list' }], list: [] };
  if (options.required && value.length === 0) {
    return { problems: [{ field, message: 'at least one address is needed' }], list: [] };
  }
  if (value.length > MAX_URIS) {
    return { problems: [{ field, message: `no more than ${MAX_URIS} addresses` }], list: [] };
  }
  const problems: Problem[] = [];
  const list: string[] = [];
  for (const [index, entry] of value.entries()) {
    const problem = urlProblem(entry, development);
    if (problem) problems.push({ field, message: `address ${index + 1} ${problem}` });
    else if (list.includes(entry as string)) {
      problems.push({ field, message: `address ${index + 1} is listed twice` });
    } else list.push(entry as string);
  }
  return { problems, list };
}

/** A line of text: trimmed, 1 to `max` characters unless optional, and no line breaks or control characters. */
export function textProblem(value: unknown, max: number, required: boolean): string | undefined {
  if (value === undefined || value === null || value === '') {
    return required ? 'is required' : undefined;
  }
  if (typeof value !== 'string') return 'must be text';
  if (value.trim() === '') return required ? 'is required' : undefined;
  if (value.length > max) return `must be at most ${max} characters`;
  if (CONTROL.test(value)) return 'must not contain line breaks or other control characters';
  return undefined;
}

/**
 * The scopes a client is allowed (core-app §3.7.1): any core knows, `openid` among them, and `roles` only when
 * the client is trusted (§3.6.4).
 */
export function scopeProblems(
  field: string,
  value: unknown,
  trusted: boolean,
): { problems: Problem[]; list: string[] } {
  if (!Array.isArray(value) || value.length === 0) {
    return { problems: [{ field, message: 'at least one scope is needed' }], list: [] };
  }
  const known = new Set<string>(OAUTH_SCOPES);
  const problems: Problem[] = [];
  const list: string[] = [];
  for (const scope of value) {
    if (typeof scope !== 'string' || !known.has(scope)) {
      problems.push({ field, message: `${String(scope).slice(0, 40)} is not a scope core offers` });
    } else if (!list.includes(scope)) list.push(scope);
  }
  if (!list.includes('openid') && problems.length === 0) {
    problems.push({ field, message: 'must include openid' });
  }
  if (list.includes('roles') && !trusted) {
    problems.push({ field, message: 'roles is only for a trusted app' });
  }
  return { problems, list };
}
