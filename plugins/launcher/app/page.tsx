import { LauncherOfflineView } from './_components/LauncherOfflineView';

/**
 * Home — offline-capable (RFC 0078; `manifest.json` declares
 * `offline: true`). This shell renders nothing per-user: no plugin list, no session,
 * no self-service directory. All of that is fetched client-side in
 * `LauncherOfflineView`, which also mirrors cached data back in when offline
 * — that's what makes this route's own server-rendered HTML safe to
 * precache at both `/launcher` and `/` (the PWA start_url, rewritten here by
 * the platform's middleware when this plugin is configured as the platform
 * root — the default) and replay with no network on a shared device.
 */
export default function LauncherPage() {
  return <LauncherOfflineView />;
}
