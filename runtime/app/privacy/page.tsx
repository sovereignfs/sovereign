import { Markdown, PageContainer } from '@sovereignfs/ui';
import { getPrivacyMarkdown } from '@/src/legal-content';
import styles from '../legal-page.module.css';

// Renders the root-level PRIVACY.md (RFC 0090) — the single source of
// truth for this content. An operator who wants their own name/contact on
// this page replaces PRIVACY.md itself; nothing here should hardcode a
// duplicate copy of that text. See docs/legal/operator-template-privacy.md.
//
// Forced dynamic: this page has no dynamic API (cookies/headers/searchParams)
// of its own, so Next.js would otherwise try to statically prerender it. That
// prerender attempt hangs indefinitely — better-sqlite3 (a native addon,
// pulled in transitively via @sovereignfs/db's findWorkspaceRoot()) never
// resolves inside Next's static-generation worker, unlike a normal
// request-time render. Forcing dynamic also matches the actual requirement:
// the content must reflect whatever PRIVACY.md currently is on disk, not a
// build-time snapshot.
export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <PageContainer maxWidth="md">
        <a href="/login" className={styles.back}>
          ← Back to sign in
        </a>
        <Markdown content={getPrivacyMarkdown()} />
      </PageContainer>
    </main>
  );
}
