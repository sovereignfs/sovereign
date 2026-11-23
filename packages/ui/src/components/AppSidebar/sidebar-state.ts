/**
 * How an app's sidebar is shown: **full**, a **rail** of icons, or **hidden**. It is a choice about a screen, not a person's data,
 * so it is kept on the device, per app and **per kind of page**: the app names its kinds (`'home'` and `'page'`, say), and a
 * person's choice changes that kind's default on this device and nothing else. Every kind opens full unless the app says
 * otherwise.
 *
 * Pure: what was stored goes in and a state comes out, so the rules are tested with no browser. Taken from Shopper's
 * `src/ui/sidebar.ts`, its first consumer, with the kinds of page left to the app.
 */
export type SidebarState = 'full' | 'rail' | 'hidden';

/** What is kept for a kind of page: how it is shown, and how it was shown last when not hidden, so that showing it again is what it was. */
export interface SidebarMemory {
  state: SidebarState;
  shown: Exclude<SidebarState, 'hidden'>;
}

export type SidebarStored = Readonly<Record<string, SidebarMemory>>;

const STATES: readonly SidebarState[] = ['full', 'rail', 'hidden'];
const isState = (value: unknown): value is SidebarState =>
  typeof value === 'string' && (STATES as readonly string[]).includes(value);

/** The key an app's choices are kept under on the device. */
export const sidebarStorageKey = (appId: string): string => `sv.sidebar.${appId}`;

/** What was stored, read defensively: anything that is not what was written is ignored, and the default stands. */
export function parseSidebarStored(raw: string | null | undefined): SidebarStored {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const out: Record<string, SidebarMemory> = {};
  for (const [kind, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { state, shown } = entry as Record<string, unknown>;
    if (!isState(state)) continue;
    out[kind] = {
      state,
      shown: shown === 'full' || shown === 'rail' ? shown : state === 'hidden' ? 'rail' : state,
    };
  }
  return out;
}

/** How the sidebar is shown on a kind of page: what was chosen there, or the default. */
/** What was kept for a kind of page, never a property every object has (`toString`, `__proto__`). */
const kept = (kind: string, stored: SidebarStored): SidebarMemory | undefined =>
  Object.hasOwn(stored, kind) ? stored[kind] : undefined;

export const sidebarStateFor = (
  kind: string,
  stored: SidebarStored,
  fallback: SidebarState = 'full',
): SidebarState => kept(kind, stored)?.state ?? fallback;

const current = (kind: string, stored: SidebarStored, fallback: SidebarState): SidebarMemory =>
  kept(kind, stored) ?? { state: fallback, shown: fallback === 'hidden' ? 'full' : fallback };

/** The header's button: hides the sidebar, or shows it again as it was. */
export function toggleSidebarHidden(
  kind: string,
  stored: SidebarStored,
  fallback: SidebarState = 'full',
): SidebarStored {
  const have = current(kind, stored, fallback);
  return {
    ...stored,
    [kind]:
      have.state === 'hidden'
        ? { state: have.shown, shown: have.shown }
        : { state: 'hidden', shown: have.state },
  };
}

/** The sidebar's own button: full becomes a rail and a rail becomes full. A hidden sidebar has no such button. */
export function toggleSidebarRail(
  kind: string,
  stored: SidebarStored,
  fallback: SidebarState = 'full',
): SidebarStored {
  const have = current(kind, stored, fallback);
  if (have.state === 'hidden') return stored;
  const next = have.state === 'full' ? 'rail' : 'full';
  return { ...stored, [kind]: { state: next, shown: next } };
}
