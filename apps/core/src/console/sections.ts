import type { IconName } from '@sovereignfs/ui';
import { can, type Capability, type Matrix } from '../roles/capabilities';

/**
 * One section of the Console (core-app §3.10, §3.12): a page operators go to, and the capability it needs.
 * A section is added here when its page exists, never before: the navigation lists only what leads
 * somewhere. The Console's pages are made by the tasks that follow, each appending its own section.
 */
export type ConsoleSection = {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  /** What it takes to see the section and to open its page. */
  capability: Capability;
  /** A heading the section is listed under, or none for a leading, ungrouped one. */
  group?: string;
};

export const CONSOLE_SECTIONS: readonly ConsoleSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/console',
    icon: 'layout-dashboard',
    capability: 'console:access',
  },
];

/**
 * The sections a role may see, in order. Nobody sees a section their role does not hold the capability for
 * (judged by the matrix in force), and a role that cannot enter the Console sees none at all, whatever each
 * section asks for: the Console is entered with `console:access` first.
 */
export function visibleSections(
  role: unknown,
  matrix: Matrix,
  sections: readonly ConsoleSection[] = CONSOLE_SECTIONS,
): ConsoleSection[] {
  if (!can(role, 'console:access', matrix)) return [];
  return sections.filter((section) => can(role, section.capability, matrix));
}

/** The section whose page is `pathname`, or one beneath it: the longest address that matches. */
export function activeSection(
  pathname: string,
  sections: readonly Pick<ConsoleSection, 'id' | 'href'>[],
): string | undefined {
  let best: { id: string; length: number } | undefined;
  for (const section of sections) {
    const matches = pathname === section.href || pathname.startsWith(`${section.href}/`);
    if (matches && (!best || section.href.length > best.length)) {
      best = { id: section.id, length: section.href.length };
    }
  }
  return best?.id;
}
