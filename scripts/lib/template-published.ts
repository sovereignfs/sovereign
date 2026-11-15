/**
 * Every Sovereign package an app made by `npm create @sovereignfs app` depends on must already be on npm at a version its range
 * accepts, or the new app's install fails (docs/releasing.md, "The manifest package"). This holds the template's ranges to what a
 * resolver says is published; the resolver is passed in so the rule can be tested without the registry.
 */
import { APP_DEPENDENCIES, APP_DEV_DEPENDENCIES } from '../../tools/create/src/versions';

export type Resolve = (name: string, range: string) => Promise<string | undefined>;

export type Unpublished = { name: string; range: string };

/** The Sovereign packages of the template, with the range each is asked for. */
export function templateSovereignPackages(
  dependencies: Record<string, string> = { ...APP_DEPENDENCIES, ...APP_DEV_DEPENDENCIES },
): Unpublished[] {
  return Object.entries(dependencies)
    .filter(([name]) => name.startsWith('@sovereignfs/'))
    .map(([name, range]) => ({ name, range }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The template's Sovereign packages that have no published version in their range. */
export async function findUnpublished(
  resolve: Resolve,
  packages: Unpublished[] = templateSovereignPackages(),
): Promise<Unpublished[]> {
  const missing: Unpublished[] = [];
  for (const entry of packages) {
    if ((await resolve(entry.name, entry.range)) === undefined) missing.push(entry);
  }
  return missing;
}
