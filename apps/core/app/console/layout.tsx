import type { ReactNode } from 'react';
import { requireConsole } from '../../src/console/guard';
import { ConsoleShell } from './console-shell';

/**
 * The Console's frame (core-app §3.10): its sections beside the page. Entering it takes `console:access`;
 * the navigation lists only the sections the person's role may open. Each page checks again for itself,
 * since this layout is not rendered again when someone moves between its pages.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const { sections } = await requireConsole();
  return (
    <ConsoleShell
      sections={sections.map(({ id, label, href, icon, group }) => ({
        id,
        label,
        href,
        icon,
        group,
      }))}
    >
      {children}
    </ConsoleShell>
  );
}
