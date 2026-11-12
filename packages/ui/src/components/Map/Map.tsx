'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../motion';
import styles from './Map.module.css';
import {
  type LatLng,
  boundsOf,
  clusterLabel,
  groupMarkers,
  isAllowedRequest,
  isLatLng,
  lineFeature,
} from './mapModel';

export type { LatLng } from './mapModel';

export type MapMarkerTone = 'accent' | 'success' | 'warning' | 'error' | 'neutral';

export interface MapMarkerData {
  /** Stable. */
  id: string;
  lat: number;
  lng: number;
  /** What the marker is, for a screen reader and the tooltip: "Café da Beira". */
  label: string;
  tone?: MapMarkerTone;
  selected?: boolean;
}

export interface MapPick {
  /** The chosen point, shown with a pin. */
  value?: LatLng | null;
  /** Called with a point chosen by clicking or tapping the map, or by pressing Enter with the map focused (the middle of the map). */
  onPick: (point: LatLng) => void;
}

export interface MapProps {
  /** The style document's address, from the app's own server. Light or dark is the style's: pass another address, and the map changes. */
  styleUrl: string;
  /** What the map shows, for assistive technology: "Where you have been". */
  ariaLabel: string;
  markers?: readonly MapMarkerData[];
  /** Groups markers that are close together into a count, which zooms in when chosen. */
  cluster?: boolean;
  onMarkerSelect?: (id: string) => void;
  /** A line through these points, in order. */
  line?: readonly LatLng[];
  /** The map is fitted to the markers and the line when this changes (and at the start). Absent, only at the start. */
  fitKey?: string | number;
  /** The view when there is nothing to fit. */
  center?: LatLng;
  zoom?: number;
  /** The person's own position, as a dot. */
  position?: (LatLng & { accuracyM?: number }) | null;
  /** Makes the map a place to choose a point. */
  pick?: MapPick;
  /** Attribution the style's sources do not carry, shown with it. */
  attribution?: string | readonly string[];
  /**
   * The address of MapLibre's worker script (`maplibre-gl-worker.mjs`), which the app serves from its own origin so that no `blob:` worker is needed: the app's CSP then says `worker-src 'self'`.
   * Absent, MapLibre makes its own `blob:` worker, which needs `worker-src blob:`.
   */
  workerUrl?: string;
  /** Origins besides the page's and the style's own that the map may fetch from. Normally none: the style's tiles, glyphs and sprite are the app's own. */
  allowedOrigins?: readonly string[];
  /** Called when the map or its style cannot be loaded; the message holds no address. */
  onError?: (message: string) => void;
  className?: string;
}

const TONE_VAR: Record<MapMarkerTone, string> = {
  accent: '--sv-color-accent',
  success: '--sv-color-success-solid',
  warning: '--sv-color-warning-text',
  error: '--sv-color-error-solid',
  neutral: '--sv-color-text-muted',
};
const LINE_SOURCE = 'sv-map-line';
const LINE_LAYER = 'sv-map-line-layer';
const FIT_PADDING = 56;
const SINGLE_POINT_ZOOM = 14;

type MapLibre = typeof import('maplibre-gl');

/**
 * A map in the suite's style (`@sovereignfs/ui/map`, its own entry so that an app with no map carries no MapLibre). MapLibre GL JS draws it from **a style the app serves** (`styleUrl`), so the app decides
 * its tiles, glyphs and sprite, and **the map makes no request to any address the app did not give** (`isAllowedRequest`).
 *
 * - **Markers** are real buttons with an accessible label, in token colours, which a keyboard reaches and a screen reader names; with `cluster`, those close together become one button with a count.
 * - **A line** through points, **fit to points**, and **the person's position** as a dot.
 * - **Choosing a point** (`pick`): a click or tap picks that point; with the map focused, the arrow keys move it and Enter picks its middle (MapLibre's own keyboard handling pans and zooms it).
 * - **Attribution** is MapLibre's, from the style's sources, with any `attribution` added.
 *
 * It needs `maplibre-gl` (an optional peer of this package), and the app's CSP needs `worker-src` (see `workerUrl`). Draw a list of the same places beside it: a map is never the only way to reach them.
 */
export function Map({
  styleUrl,
  ariaLabel,
  markers = [],
  cluster = false,
  onMarkerSelect,
  line,
  fitKey,
  center,
  zoom,
  position,
  pick,
  attribution,
  workerUrl,
  allowedOrigins,
  onError,
  className,
}: MapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  // Counts each time a style has loaded, so that what is drawn on it (the line) is drawn again on the next.
  const [styleVersion, setStyleVersion] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  // What the effects read, kept current without re-running them.
  const latest = useRef({ onMarkerSelect, pick, onError, reducedMotion, markers, line });
  latest.current = { onMarkerSelect, pick, onError, reducedMotion, markers, line };

  // The map itself: made once, removed when the component goes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let made: MapLibreMap | null = null;
    void import('maplibre-gl')
      .then((lib) => {
        if (cancelled) return;
        libRef.current = lib;
        if (workerUrl) lib.setWorkerUrl(workerUrl);
        const base = window.location.href;
        const custom = attribution === undefined ? undefined : [attribution].flat();
        made = new lib.Map({
          container: root,
          style: styleUrl,
          center: center ? [center.lng, center.lat] : [0, 20],
          zoom: zoom ?? 1.5,
          attributionControl: {
            compact: true,
            ...(custom ? { customAttribution: custom } : {}),
          },
          // Only the addresses the app gave: anything else is turned into a request that cannot succeed.
          transformRequest: (url) =>
            isAllowedRequest(url, {
              base: new URL(styleUrl, base).href,
              ...(allowedOrigins ? { allowedOrigins } : {}),
            }) || isAllowedRequest(url, { base, ...(allowedOrigins ? { allowedOrigins } : {}) })
              ? { url }
              : { url: 'data:,' },
        });
        mapRef.current = made;
        made.on('load', () => setReady(true));
        made.on('style.load', () => setStyleVersion((version) => version + 1));
        made.on('error', () => latest.current.onError?.('The map could not be loaded.'));
        made.on('click', (event) => {
          const choose = latest.current.pick;
          if (choose) choose.onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng });
        });
      })
      .catch(() => latest.current.onError?.('The map could not be loaded.'));
    return () => {
      cancelled = true;
      made?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // The map is made once; its style, view and what it shows are the other effects' to keep current.
  }, []);

  // Another style (light to dark, say).
  const shownStyle = useRef(styleUrl);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || shownStyle.current === styleUrl) return;
    shownStyle.current = styleUrl;
    map.setStyle(styleUrl);
  }, [styleUrl, ready]);

  // The line, drawn on whatever style is loaded, in the accent colour as the page has it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const points = (line ?? []).filter(isLatLng);
    const existing = map.getSource(LINE_SOURCE) as
      { setData(data: ReturnType<typeof lineFeature>): void } | undefined;
    if (points.length < 2) {
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
      if (existing) map.removeSource(LINE_SOURCE);
      return;
    }
    const feature = lineFeature(points);
    if (existing) {
      existing.setData(feature);
      return;
    }
    const colour =
      getComputedStyle(rootRef.current ?? document.body)
        .getPropertyValue('--sv-color-accent')
        .trim() || '#000000';
    map.addSource(LINE_SOURCE, { type: 'geojson', data: feature });
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: LINE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': colour, 'line-width': 3, 'line-opacity': 0.9 },
    });
  }, [line, ready, styleVersion]);

  // Markers: real buttons, grouped when `cluster` and the map moves.
  const drawn = useRef(new globalThis.Map<string, MapLibreMarker>());
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;
    const valid = markers.filter(isLatLng);
    const byId: Record<string, MapMarkerData> = {};
    for (const marker of valid) byId[marker.id] = marker;

    const keep = new Set<string>();
    const place = (key: string, make: () => HTMLElement, at: LatLng) => {
      keep.add(key);
      const existing = drawn.current.get(key);
      if (existing) {
        existing.setLngLat([at.lng, at.lat]);
        return;
      }
      const element = make();
      drawn.current.set(
        key,
        new lib.Marker({ element, anchor: 'center' }).setLngLat([at.lng, at.lat]).addTo(map),
      );
    };

    const render = () => {
      keep.clear();
      const groups = cluster
        ? groupMarkers(
            valid.map((marker) => {
              const point = map.project([marker.lng, marker.lat]);
              return { id: marker.id, x: point.x, y: point.y };
            }),
          )
        : valid.map((marker) => ({ kind: 'point' as const, id: marker.id }));
      for (const group of groups) {
        if (group.kind === 'point') {
          const marker = byId[group.id] as MapMarkerData;
          // A marker is drawn again when what it looks like changed: its key says so.
          const key = `p:${marker.id}:${marker.tone ?? 'accent'}:${marker.selected ? 1 : 0}:${marker.label}`;
          place(
            key,
            () => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = [
                styles.marker,
                styles[marker.tone ?? 'accent'],
                marker.selected ? styles.selected : '',
              ]
                .filter(Boolean)
                .join(' ');
              button.setAttribute('aria-label', marker.label);
              button.title = marker.label;
              button.style.setProperty(
                '--marker-colour',
                `var(${TONE_VAR[marker.tone ?? 'accent']})`,
              );
              button.addEventListener('click', (event) => {
                event.stopPropagation();
                latest.current.onMarkerSelect?.(marker.id);
              });
              return button;
            },
            marker,
          );
        } else {
          const members = group.ids.map((id) => byId[id] as MapMarkerData);
          const at = map.unproject([group.x, group.y]);
          place(
            group.key,
            () => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = `${styles.marker} ${styles.cluster}`;
              button.textContent = String(members.length);
              button.setAttribute('aria-label', clusterLabel(members.length));
              button.addEventListener('click', (event) => {
                event.stopPropagation();
                const box = boundsOf(members);
                if (box)
                  map.fitBounds(box, {
                    padding: FIT_PADDING,
                    maxZoom: 18,
                    animate: !latest.current.reducedMotion,
                  });
              });
              return button;
            },
            { lat: at.lat, lng: at.lng },
          );
        }
      }
      for (const [key, marker] of drawn.current) {
        if (keep.has(key)) continue;
        marker.remove();
        drawn.current.delete(key);
      }
    };

    render();
    if (cluster) map.on('moveend', render);
    return () => {
      if (cluster) map.off('moveend', render);
    };
  }, [markers, cluster, ready]);
  // Every marker is removed with the map.
  useEffect(
    () => () => {
      for (const marker of drawn.current.values()) marker.remove();
      drawn.current.clear();
    },
    [],
  );

  // The person's position, and the point being chosen.
  const dot = useRef<MapLibreMarker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;
    if (!position || !isLatLng(position)) {
      dot.current?.remove();
      dot.current = null;
      return;
    }
    if (!dot.current) {
      const element = document.createElement('div');
      element.className = styles.position ?? '';
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', 'Your position');
      dot.current = new lib.Marker({ element, anchor: 'center' })
        .setLngLat([position.lng, position.lat])
        .addTo(map);
    } else dot.current.setLngLat([position.lng, position.lat]);
    return undefined;
  }, [position, ready]);
  useEffect(
    () => () => {
      dot.current?.remove();
    },
    [],
  );

  const pin = useRef<MapLibreMarker | null>(null);
  const picked = pick?.value;
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;
    if (!picked || !isLatLng(picked)) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (!pin.current) {
      const element = document.createElement('div');
      element.className = styles.pin ?? '';
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', 'Chosen point');
      pin.current = new lib.Marker({ element, anchor: 'bottom' })
        .setLngLat([picked.lng, picked.lat])
        .addTo(map);
    } else pin.current.setLngLat([picked.lng, picked.lat]);
  }, [picked, ready]);
  useEffect(
    () => () => {
      pin.current?.remove();
    },
    [],
  );

  // Fit to the markers and the line: at the start, and whenever `fitKey` changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const points = [...latest.current.markers, ...(latest.current.line ?? [])].filter(isLatLng);
    const box = boundsOf(points);
    if (!box) return;
    const animate = !latest.current.reducedMotion;
    if (points.length === 1) {
      const only = points[0] as LatLng;
      map.easeTo({ center: [only.lng, only.lat], zoom: SINGLE_POINT_ZOOM, animate });
    } else map.fitBounds(box, { padding: FIT_PADDING, maxZoom: 16, animate });
  }, [fitKey, ready]);

  return (
    // The map is a region; MapLibre makes its canvas focusable, and its own keyboard handling pans and zooms it. With `pick`, Enter on the focused map chooses its middle.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a map is a focusable region with keyboard handling of its own; Enter picks only while choosing a point
    <div
      ref={rootRef}
      role="region"
      aria-label={ariaLabel}
      className={[styles.root, pick ? styles.picking : '', className].filter(Boolean).join(' ')}
      onKeyDown={(event) => {
        if (!pick || event.key !== 'Enter') return;
        if (event.target instanceof HTMLButtonElement) return;
        const middle = mapRef.current?.getCenter();
        if (!middle) return;
        event.preventDefault();
        pick.onPick({ lat: middle.lat, lng: middle.lng });
      }}
    />
  );
}
