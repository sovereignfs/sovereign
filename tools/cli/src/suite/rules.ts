import { satisfies } from 'semver';
import { RELEASE } from '../release.js';
import { isExternal, type Suite } from './types.js';
import type { Problem } from './schema.js';

/**
 * Whether a value looks like a secret (spec/suite.md §1.2; operator-cli §4.5). A guard and not a guarantee: it catches the common
 * shapes, and an operator must not be told it catches all of them.
 */
export function looksLikeSecret(value: string): boolean {
  return (
    /AGE-SECRET-KEY-1/.test(value) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) ||
    // A password in an address: scheme://user:password@host
    /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(value) ||
    // The prefixes of tokens that services issue.
    /^(ghp|gho|ghu|ghs|github_pat|glpat|sk|rk|xox[abpr]|AKIA)[-_A-Za-z0-9]{16,}$/.test(value) ||
    // A long run of base64 or hex with no spaces: a key, a token, a generated secret.
    /^[A-Za-z0-9+/_-]{40,}={0,2}$/.test(value)
  );
}

/** What the schema cannot say about `suite.yml` (spec/suite.md), judged against this toolkit's release. */
export function suiteProblems(suite: Suite): Problem[] {
  const problems: Problem[] = [];
  const add = (at: string, message: string) => problems.push({ at, message });

  if (!(RELEASE.schemas as readonly number[]).includes(suite.schema)) {
    add('schema', `is ${suite.schema}, which this toolkit does not read`);
  }
  if (!satisfies(suite.core.version, RELEASE.core)) {
    add(
      'core.version',
      `${suite.core.version} is outside what this toolkit deploys (${RELEASE.core}); run sv upgrade, or use a toolkit that supports it`,
    );
  }
  for (const name of suite.purge ?? []) {
    if (suite.apps && name in suite.apps)
      add(`purge`, `${name} is purged and is also listed under apps`);
  }
  const scan = (at: string, env: Record<string, string> | undefined) => {
    for (const [name, value] of Object.entries(env ?? {})) {
      if (looksLikeSecret(value)) {
        add(`${at}.${name}`, 'looks like a secret; put it in secrets.age.yml with sv secret set');
      }
    }
  };
  scan('core.env', suite.core.env);
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (!isExternal(app)) scan(`apps.${name}.env`, app.env);
  }
  const hosts = new Set<string>();
  for (const name of Object.keys(suite.apps ?? {})) {
    const host = `${name}.${suite.domain}`;
    if (hosts.has(host)) add(`apps.${name}`, 'has the same address as another app');
    hosts.add(host);
  }
  return problems;
}
