import { RELEASE } from '../release.js';
import type { Problem } from './schema.js';
import { isExternal, type Digest, type Lock, type Suite } from './types.js';

/** The image each thing runs, as `suite.yml` and this release say (spec/suite.md §2). External apps run nothing. */
export function wantedImages(suite: Suite): {
  cli: string;
  core: string;
  database: string;
  proxy: string;
  apps: Record<string, string>;
} {
  const apps: Record<string, string> = {};
  for (const [name, app] of Object.entries(suite.apps ?? {})) {
    if (!isExternal(app)) apps[name] = app.image;
  }
  return {
    cli: `${RELEASE.images.cli}:${RELEASE.version}`,
    core: `${RELEASE.images.core}:${suite.core.version}`,
    database: `${RELEASE.images.database}:${suite.database.version}`,
    proxy: RELEASE.images.proxy,
    apps,
  };
}

/** How `suite.lock` differs from what `suite.yml` wants: every hosted app is in it, nothing else is, and each ref is the one wanted. */
export function lockProblems(suite: Suite, lock: Lock): Problem[] {
  const wanted = wantedImages(suite);
  const problems: Problem[] = [];
  for (const key of ['cli', 'core', 'database', 'proxy'] as const) {
    if (lock.images[key].ref !== wanted[key]) {
      problems.push({
        at: `images.${key}`,
        message: `is ${lock.images[key].ref}, and suite.yml wants ${wanted[key]}`,
      });
    }
  }
  for (const [name, ref] of Object.entries(wanted.apps)) {
    const locked = lock.apps?.[name];
    if (!locked) problems.push({ at: `apps.${name}`, message: 'is not in suite.lock' });
    else if (locked.ref !== ref) {
      problems.push({
        at: `apps.${name}`,
        message: `is ${locked.ref}, and suite.yml wants ${ref}`,
      });
    }
  }
  for (const name of Object.keys(lock.apps ?? {})) {
    if (!(name in wanted.apps))
      problems.push({ at: `apps.${name}`, message: 'is in suite.lock and not in suite.yml' });
  }
  return problems;
}

/**
 * The lock for `suite`: what is already pinned to the ref wanted stays as it is (a moved tag must not change what runs), and
 * only a ref that is new or changed is resolved to a digest. Nothing else writes `suite.lock` (operator-cli §5).
 */
export async function refreshedLock(
  suite: Suite,
  current: Lock | undefined,
  resolve: (ref: string) => Promise<string>,
): Promise<Lock> {
  const wanted = wantedImages(suite);
  const pin = async (ref: string, existing: Digest | undefined): Promise<Digest> =>
    existing && existing.ref === ref ? existing : { ref, digest: await resolve(ref) };
  const apps: Record<string, Digest> = {};
  for (const [name, ref] of Object.entries(wanted.apps)) {
    apps[name] = await pin(ref, current?.apps?.[name]);
  }
  return {
    schema: 1,
    images: {
      cli: await pin(wanted.cli, current?.images.cli),
      core: await pin(wanted.core, current?.images.core),
      database: await pin(wanted.database, current?.images.database),
      proxy: await pin(wanted.proxy, current?.images.proxy),
    },
    ...(Object.keys(apps).length > 0 ? { apps } : {}),
  };
}
