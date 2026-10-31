import { readManifest } from '../manifest.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { isReservedForApp, SECRET_NAME } from './names.js';
import type { Problem } from './schema.js';
import { isExternal, type HostedApp, type Lock, type Manifest, type Suite } from './types.js';

/** The manifest of a hosted app of this suite, read as the lock pins it. */
export async function manifestOf(
  ctx: Pick<Context, 'registry' | 'fetch'>,
  suite: Suite,
  lock: Lock | undefined,
  name: string,
): Promise<Manifest> {
  const app = suite.apps?.[name];
  if (!app || isExternal(app)) {
    throw new Refused(`${name} is not a hosted app in suite.yml.`);
  }
  return readManifest(
    name,
    app,
    ctx.registry,
    suite.core.version,
    ctx.fetch,
    lock?.apps?.[name]?.digest,
  );
}

/** What an app's `env` may and may not hold, given its manifest (spec/suite.md §1.7, spec/app-manifest.md §3). */
export function appEnvProblems(name: string, app: HostedApp, manifest: Manifest): Problem[] {
  const problems: Problem[] = [];
  for (const variable of Object.keys(app.env ?? {})) {
    if (!variable.startsWith(`${manifest.prefix}_`)) {
      problems.push({
        at: `apps.${name}.env.${variable}`,
        message: `must begin with ${manifest.prefix}_, the prefix of the app’s manifest`,
      });
    } else if (isReservedForApp(variable, manifest.prefix, manifest.generate)) {
      problems.push({
        at: `apps.${name}.env.${variable}`,
        message: 'is given to the app by the deployment, and cannot be set here',
      });
    } else if (SECRET_NAME.test(variable)) {
      problems.push({
        at: `apps.${name}.env.${variable}`,
        message: 'looks like a secret; put it in secrets.age.yml with sv secret set',
      });
    }
  }
  return problems;
}
