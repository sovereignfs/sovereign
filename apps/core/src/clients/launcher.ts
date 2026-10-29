import type { Auth } from '../auth/auth';
import { clientView, type ClientRow, type ClientView } from './registry';

/** One tile of the launcher (core-app §3.8): what a person needs to see an app and open it, and nothing more. */
export type LauncherApp = {
  id: string;
  name: string;
  description: string | undefined;
  icon: string | undefined;
  launchUrl: string;
};

/**
 * The apps the launcher lists: enabled, with "show in launcher" on, and with somewhere to send people. An app
 * with no launch address has nothing to open, so it is not a tile. In name order. The launcher is not access
 * control (§3.8): every signed-in person with `launcher:access` sees every one of these.
 */
export function launcherApps(views: readonly ClientView[]): LauncherApp[] {
  const apps: LauncherApp[] = [];
  for (const view of views) {
    if (!view.enabled || !view.launcher.show || view.launcher.launchUrl === undefined) continue;
    apps.push({
      id: view.clientId,
      name: view.name,
      description: view.launcher.description,
      icon: view.launcher.icon,
      launchUrl: view.launcher.launchUrl,
    });
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Reads the apps for the launcher. This is a read of what the person is meant to see, not the registry (which
 * needs `client:manage` and returns every setting): the page that calls it has already checked `launcher:access`,
 * and only the fields of a tile leave here, never a redirect address or a scope.
 */
export async function listLauncherApps(auth: Pick<Auth, '$context'>): Promise<LauncherApp[]> {
  const rows = await (await auth.$context).adapter.findMany<ClientRow>({ model: 'oauthClient' });
  return launcherApps(rows.map(clientView));
}
