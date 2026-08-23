import { LayoutDemo } from './_components/LayoutDemo';

/**
 * Example: ThreeColumnLayout — reference plugin demonstrating
 * @sovereignfs/ui's ThreeColumnLayout: a fixed sidebar, a flexible main
 * column, and a detail column that only takes up space once something is
 * selected. Click a list, then a task, to see the detail column appear;
 * deselect to see main reclaim the full width instead of it just going
 * blank.
 *
 * Below the mobile breakpoint, LayoutDemo forks to a completely different,
 * stacked single-pane tree (MobileStackedDemo) — see that file and
 * LayoutDemo.tsx for why ThreeColumnLayout itself doesn't attempt to
 * handle narrow widths on its own.
 */
export default function ThreeColumnLayoutExamplePage() {
  return <LayoutDemo />;
}
