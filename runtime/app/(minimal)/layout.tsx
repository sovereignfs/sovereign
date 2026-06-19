import type { ReactNode } from 'react';
import styles from './minimal.module.css';

/**
 * Chrome-free, full-bleed layout for `shell: "minimal"` plugins (RFC 0014).
 *
 * No sidebar, header, or footer — the plugin owns the entire viewport. The
 * session gate still applies (enforced by the runtime middleware), so only
 * authenticated users reach these routes.
 *
 * `force-dynamic` ensures the per-request CSP nonce from the middleware is
 * applied on every render rather than being served from a static/cached
 * response.
 */
export const dynamic = 'force-dynamic';

export default function MinimalLayout({ children }: { children: ReactNode }) {
  return <div className={styles.root}>{children}</div>;
}
