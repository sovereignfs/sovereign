import Link from 'next/link';
import { PageContainer, PageHeader } from '@sovereignfs/ui';
import styles from './page.module.css';

interface LayoutDemo {
  slug: string;
  name: string;
  summary: string;
}

// Add an entry here (plus its own app/<slug>/ route) for every new layout
// primitive this plugin demonstrates.
const LAYOUT_DEMOS: LayoutDemo[] = [
  {
    slug: 'three-column',
    name: 'ThreeColumnLayout',
    summary: 'Sidebar + main + optional detail column — the list-app shell used by Tasks.',
  },
  {
    slug: 'header-footer',
    name: 'HeaderFooterLayout',
    summary:
      'Fixed-height header + scrollable main + fixed-height footer, both independently optional.',
  },
  {
    slug: 'root-layout',
    name: 'RootLayout',
    summary:
      "The root-level layout a plugin's page tree sits in — plain, sidebar (web-only), header (both breakpoints), or shell (mobile-only header+footer).",
  },
  {
    slug: 'page-layout',
    name: 'PageLayout',
    summary:
      "A single page's content area nested inside RootLayout's main slot — no padding by default, plus an optional page-specific header.",
  },
];

export default function ExampleLayoutsPage() {
  return (
    <PageContainer maxWidth="md">
      <PageHeader
        title="Example: Layouts"
        description="Reference implementations of @sovereignfs/ui's page-layout primitives, for plugin developers to copy from."
      />
      <ul className={styles.list}>
        {LAYOUT_DEMOS.map((demo) => (
          <li key={demo.slug} className={styles.item}>
            <Link href={`/example-layouts/${demo.slug}`} className={styles.link}>
              {demo.name}
            </Link>
            <p className={styles.summary}>{demo.summary}</p>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
