/**
 * What the `Map` decides without a map: which requests it lets through, the shapes it hands MapLibre, and how markers group when they are close. Pure, so each is tested exactly, and the part
 * that needs WebGL (`Map.tsx`) stays a thin wiring of these.
 */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export const isLatLng = (value: unknown): value is LatLng =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as LatLng).lat === 'number' &&
  typeof (value as LatLng).lng === 'number' &&
  Number.isFinite((value as LatLng).lat) &&
  Number.isFinite((value as LatLng).lng) &&
  Math.abs((value as LatLng).lat) <= 90 &&
  Math.abs((value as LatLng).lng) <= 180;

/**
 * Whether the map may fetch `url`: **only from addresses the app gave**. Its style's own origin and the page's own are allowed (a style's tiles, glyphs and sprite are normally the app's own
 * `/api/map`), and anything listed in `allowedOrigins`; `blob:` and `data:` carry their own bytes. Every other request is refused, so a style that names a third-party tile server, font or
 * sprite makes no request to it, whatever it says.
 */
export function isAllowedRequest(
  url: string,
  options: { base: string; allowedOrigins?: readonly string[] },
): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) return true;
  let target: URL;
  try {
    target = new URL(url, options.base);
  } catch {
    return false;
  }
  if (target.protocol === 'blob:' || target.protocol === 'data:') return true;
  const allowed = new Set([new URL(options.base).origin, ...(options.allowedOrigins ?? [])]);
  return allowed.has(target.origin);
}

/** A bounding box, west-south then east-north, of the points, or `undefined` for none. */
export function boundsOf(
  points: readonly LatLng[],
): [[number, number], [number, number]] | undefined {
  if (points.length === 0) return undefined;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const point of points) {
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** A line through the points, as GeoJSON (longitude first, as GeoJSON has it). */
export function lineFeature(points: readonly LatLng[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: points.map((point) => [point.lng, point.lat]),
    },
  };
}

export interface ProjectedMarker {
  readonly id: string;
  /** Where it is on the screen, in pixels. */
  readonly x: number;
  readonly y: number;
}

export type Grouped =
  | { readonly kind: 'point'; readonly id: string }
  | {
      readonly kind: 'cluster';
      /** Stable for the same members, so that a marker of the page is kept and not drawn again. */
      readonly key: string;
      readonly ids: readonly string[];
      readonly x: number;
      readonly y: number;
    };

/**
 * Groups markers that are within one cell of a grid on the screen: a cell with one marker is that marker, a cell with several is a cluster at their centre. Done in the pixels of the map as it
 * is now (the caller projects), so that zooming in separates them. The order of the input is kept, and the same input gives the same groups.
 */
export function groupMarkers(markers: readonly ProjectedMarker[], cellPx = 56): Grouped[] {
  const cells = new Map<string, ProjectedMarker[]>();
  const order: string[] = [];
  for (const marker of markers) {
    const key = `${Math.floor(marker.x / cellPx)}:${Math.floor(marker.y / cellPx)}`;
    const cell = cells.get(key);
    if (cell) cell.push(marker);
    else {
      cells.set(key, [marker]);
      order.push(key);
    }
  }
  return order.map((key): Grouped => {
    const members = cells.get(key) as ProjectedMarker[];
    const first = members[0] as ProjectedMarker;
    if (members.length === 1) return { kind: 'point', id: first.id };
    const ids = members.map((member) => member.id);
    return {
      kind: 'cluster',
      key: `c:${ids.join(',')}`,
      ids,
      x: members.reduce((sum, member) => sum + member.x, 0) / members.length,
      y: members.reduce((sum, member) => sum + member.y, 0) / members.length,
    };
  });
}

/** What a screen reader hears for a group of markers. */
export const clusterLabel = (count: number): string =>
  `${count} places close together. Press to zoom in.`;
