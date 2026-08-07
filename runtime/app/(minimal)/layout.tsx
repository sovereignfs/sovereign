import type { ReactNode } from 'react';
import { OfflineBanner } from '../(platform)/_components/OfflineBanner';
import styles from './minimal.module.css';

/**
 * Chrome-free, full-bleed layout for `shell: "minimal"` plugins (RFC 0014).
 *
 * No sidebar, header, or footer — the plugin owns the entire viewport. The
 * session gate still applies by default (enforced by the runtime
 * middleware), so only authenticated users reach these routes — unless the
 * plugin also declares `public: true` (RFC 0089), which exempts its entire
 * `routePrefix` from that gate. This layout has no auth logic of its own
 * either way; it only supplies chrome-free rendering.
 *
 * `force-dynamic` ensures the per-request CSP nonce from the middleware is
 * applied on every render rather than being served from a static/cached
 * response.
 */
export const dynamic = 'force-dynamic';

export default function MinimalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.root}>
      <OfflineBanner />
      {children}
    </div>
  );
}
