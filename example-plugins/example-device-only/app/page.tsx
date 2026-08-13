import { DeviceOnlyNotesView } from './_components/DeviceOnlyNotesView';

/**
 * Bare `routePrefix` entry point — offline-capable (`manifest.json` declares
 * `offline: "device-only"`, RFC 0093). This shell renders nothing per-user
 * and fetches no data server-side: everything (gate checks, notes, session
 * status) is read client-side in `DeviceOnlyNotesView`, the same
 * user-neutral-shell pattern `plugins/launcher/app/page.tsx` uses for its
 * own offline route — what makes this route's SSR output safe to precache
 * and replay on a shared device with no risk of leaking one user's notes to
 * another (there is nothing per-user in the HTML to leak in the first
 * place).
 */
export default function ExampleDeviceOnlyPage() {
  return <DeviceOnlyNotesView />;
}
