import type { SovereignManifest } from '@sovereignfs/manifest';
import type { DialogSize } from '@sovereignfs/ui';

/** Fallback dialog size when a plugin declares none (or the segment is unknown). */
export const DEFAULT_OVERLAY_SIZE: DialogSize = 'lg';

/**
 * The route segment behind an `@modal` interception copy. The generate script
 * composes overlay plugins as `@modal/(.)<routeSegment>`, so the selected layout
 * segment carries the `(.)` interception marker — strip it to recover the plain
 * segment (e.g. `(.)console` → `console`).
 */
export function routeSegmentFromInterception(segment: string): string {
  return segment.replace(/^\(\.\)/, '');
}

/**
 * The dialog size an overlay plugin declares via its manifest `overlaySize`,
 * resolved from the `@modal` slot's selected layout segment. Defaults to `lg`
 * for the slot's empty/default state or any plugin that omits the field.
 *
 * The manifest's `overlaySize` enum (`packages/manifest/src/schema.ts`) only
 * accepts `sm | md | lg` — deliberately narrower than `@sovereignfs/ui`'s
 * full `DialogSize` (`sm | md | xl | lg | full`). `xl`/`full` exist for
 * runtime code that renders `<Dialog>` directly (e.g. `CardDetailOverlay`)
 * but are not reachable from any plugin manifest declaration. This is an
 * intentional gap, not an oversight — extend the manifest enum if a real
 * plugin use case for manifest-declared `xl`/`full` ever surfaces.
 */
export function overlaySizeForSegment(
  segment: string | null,
  plugins: SovereignManifest[],
): DialogSize {
  if (segment === null || segment === '__DEFAULT__') return DEFAULT_OVERLAY_SIZE;
  const routeSegment = routeSegmentFromInterception(segment);
  const plugin = plugins.find((m) => m.shell === 'overlay' && m.routePrefix === `/${routeSegment}`);
  return plugin?.shellConfig?.overlaySize ?? DEFAULT_OVERLAY_SIZE;
}
