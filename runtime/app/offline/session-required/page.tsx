// Offline session-required page (research 0012, epic task 2.32) — distinct
// from /offline (runtime/app/offline/page.tsx), which is next-pwa's generic
// document-cache-miss fallback ("nothing cached here at all"). This route
// exists for a narrower case: the device is offline AND the service worker's
// own signature check on the offline session assertion found no valid one
// (never signed in, signed out, or the assertion expired). It is served by
// the pages cache's handlerDidError plugin in next.config.ts, which checks
// exactly that before delegating to next-pwa's generic fallback for every
// other case — see the comment there for the full routing.
//
// Precached explicitly via workboxOptions.additionalManifestEntries (also in
// next.config.ts): nobody navigates here in the ordinary course of using the
// app, so unlike an actually-visited page it would never end up in the cache
// on its own. Bump that entry's revision if this file's content changes.
//
// Kept self-contained — no auth, data, or platform chrome, same discipline as
// /offline — so it renders correctly with no network and no valid session.
export const metadata = {
  title: 'Connect to sign in — Sovereign',
};

export default function OfflineSessionRequiredPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--sv-space-3)',
        padding: 'var(--sv-space-8)',
        textAlign: 'center',
        color: 'var(--sv-color-text-primary)',
        background: 'var(--sv-color-surface)',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 'var(--sv-font-size-xl)' }}>Connect to sign in</h1>
      <p style={{ margin: 0, maxWidth: '32ch', color: 'var(--sv-color-text-muted)' }}>
        Sovereign can’t verify your session without a connection. Reconnect and sign in again to
        continue.
      </p>
    </main>
  );
}
