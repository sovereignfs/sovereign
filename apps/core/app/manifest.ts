import type { MetadataRoute } from 'next';
import { getInstanceIdentity } from '../src/instance/service';
import {
  LAUNCH_HANDLER,
  MANIFEST_SCREENSHOTS,
  MANIFEST_SHORTCUTS,
  manifestIcons,
  shortName,
  THEME_COLORS,
} from '../src/pwa';

// The instance's name is read on every request: renaming it in the Console renames the app. Next would otherwise
// build this once and keep it.
export const dynamic = 'force-dynamic';

/**
 * The web app manifest (RFC 0001): what a browser needs to install core as an app. It is public and the same for
 * everyone, so it says nothing about who asks; the name is the one the public branding document already carries.
 * The scope is core's origin and no wider: the apps in the launcher are other origins and open outside the window.
 * Its `id` is fixed: a browser knows an installed app by it, so changing it would leave every install orphaned.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { name, appIcon, appIconMaskable } = await getInstanceIdentity();
  return {
    id: '/',
    name,
    short_name: shortName(name),
    description: 'Sign in, and open your apps.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    icons: manifestIcons({ appIcon, appIconMaskable }),
    launch_handler: { client_mode: [...LAUNCH_HANDLER.client_mode] },
    shortcuts: MANIFEST_SHORTCUTS,
    screenshots: MANIFEST_SCREENSHOTS.map((shot) => ({ ...shot })),
    categories: ['productivity', 'utilities'],
    lang: 'en',
    dir: 'ltr',
  };
}
