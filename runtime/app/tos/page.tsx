import { Markdown, PageContainer } from '@sovereignfs/ui';
import { getTosMarkdown } from '@/src/legal-content';
import styles from '../legal-page.module.css';

// Renders the root-level TOS.md (RFC 0090) — the single source of truth
// for this content. An operator who wants their own name/contact on this
// page replaces TOS.md itself; nothing here should hardcode a duplicate
// copy of that text. See docs/legal/operator-template-terms.md.
//
// Forced dynamic: see the matching comment in ../privacy/page.tsx — a
// static-prerender attempt of this page hangs indefinitely on the native
// better-sqlite3 addon pulled in transitively via @sovereignfs/db.
export const dynamic = 'force-dynamic';

export default function TosPage() {
  return (
    <main className={styles.page}>
      <PageContainer maxWidth="md">
        <a href="/login" className={styles.back}>
          ← Back to sign in
        </a>
        <Markdown content={getTosMarkdown()} />
      </PageContainer>
    </main>
  );
}
