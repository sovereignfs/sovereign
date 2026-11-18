import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { serviceWorkerResponse, serviceWorkerSource } from '@sovereignfs/pwa';

/**
 * The service worker, served from the root so it controls the whole app (`@sovereignfs/pwa`). It keeps only what is the same for
 * everyone, never a page of a person. Its version is the build's, so a new build is a new worker, announced to an open page.
 */
export const dynamic = 'force-dynamic';

/** The build's id, or `development` when this is not a production build (where nothing registers the worker). */
function buildId(): string {
  try {
    return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return 'development';
  }
}

/** The build's static files as the addresses they are served at: scripts, styles and fonts, the same for everyone. */
function builtFiles(): string[] {
  const out: string[] = [];
  const walk = (directory: string, prefix: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else if (!name.endsWith('.map')) out.push(`/_next/static/${prefix}${name}`);
    }
  };
  try {
    walk(join(process.cwd(), '.next', 'static'), '');
  } catch {
    // Not a production build: nothing to keep.
  }
  return out.sort();
}

export function GET() {
  return serviceWorkerResponse(serviceWorkerSource({ version: buildId(), precache: builtFiles() }));
}
