import { PageLayoutDemo } from './_components/PageLayoutDemo';

/**
 * Example: PageLayout — reference plugin demonstrating @sovereignfs/ui's
 * PageLayout: a single page's content area nested inside RootLayout's main
 * slot, with no padding by default (opt in via padding) and an optional
 * page-specific header (a board title/toolbar, distinct from the app-level
 * header RootLayout itself renders). Shown composed together, the way a
 * real plugin would actually use them: RootLayout variant="sidebar" for
 * the app-level nav, PageLayout for this one page's own header + padded
 * content.
 */
export default function PageLayoutExamplePage() {
  return <PageLayoutDemo />;
}
