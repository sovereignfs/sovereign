import type { IconName } from '@sovereignfs/ui';

export interface Section {
  slug: string;
  label: string;
  icon: IconName;
  body: string;
}

// Static stand-ins for what a real plugin's sections would be (a list, a
// gallery, a settings page, ...). This POC has no data layer — every value
// here is hardcoded, and every page it drives renders a fixed dummy message.
// The point is to exercise navigation and UI events through MobileHeader,
// MobileFooter, and SwipableMobileCarousel, not to model real content.
export const SECTIONS: Section[] = [
  {
    slug: 'home',
    label: 'Home',
    icon: 'house',
    body: "A plugin's landing view — a dashboard, a feed, an index of records. Dummy content only; this POC has no data layer.",
  },
  {
    slug: 'notes',
    label: 'Notes',
    icon: 'file',
    body: 'A list view — items, records, notes. On mobile this is one carousel slide among several; on desktop it is the content pane next to the sidebar.',
  },
  {
    slug: 'gallery',
    label: 'Gallery',
    icon: 'grid-2x2',
    body: 'A grid/gallery view. Swipe left/right on mobile to move between sections — the native scroll-snap container supplies the gesture, not hand-rolled touch handling.',
  },
  {
    slug: 'settings',
    label: 'Settings',
    icon: 'settings',
    body: 'A settings/detail view. Each section is independent — there is no shared state or persistence between them in this POC.',
  },
];

export function sectionBySlug(slug: string): Section | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}
