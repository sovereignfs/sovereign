import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  clusterLabel,
  groupMarkers,
  isAllowedRequest,
  isLatLng,
  lineFeature,
} from '../mapModel';

const BASE = 'https://waymark.example.org/trips/1';

describe('which requests the map may make', () => {
  it('lets through the page’s own address, relative ones, and what carries its own bytes', () => {
    expect(
      isAllowedRequest('https://waymark.example.org/api/map/tiles/1/2/3.pbf', { base: BASE }),
    ).toBe(true);
    expect(isAllowedRequest('/api/map/glyphs/Noto/0-255.pbf', { base: BASE })).toBe(true);
    expect(isAllowedRequest('tiles/1/2/3.pbf', { base: BASE })).toBe(true);
    expect(isAllowedRequest('blob:https://waymark.example.org/abc', { base: BASE })).toBe(true);
    expect(isAllowedRequest('data:image/png;base64,AAAA', { base: BASE })).toBe(true);
  });

  it('refuses every other origin, however the style names it', () => {
    for (const url of [
      'https://tiles.example.net/1/2/3.pbf',
      'http://waymark.example.org/api/map/tiles/1.pbf',
      'https://waymark.example.org.evil.example/x',
      'https://fonts.example.com/Noto.pbf',
      '//cdn.example.net/sprite.png',
    ])
      expect(isAllowedRequest(url, { base: BASE }), url).toBe(false);
  });

  it('allows an origin the app lists, and no other', () => {
    const options = { base: BASE, allowedOrigins: ['https://tiles.example.net'] };
    expect(isAllowedRequest('https://tiles.example.net/1/2/3.pbf', options)).toBe(true);
    expect(isAllowedRequest('https://other.example.net/1/2/3.pbf', options)).toBe(false);
  });
});

describe('the shapes it hands the map', () => {
  it('knows a point on the globe', () => {
    expect(isLatLng({ lat: 38.7, lng: -9.1 })).toBe(true);
    for (const bad of [
      null,
      {},
      { lat: 91, lng: 0 },
      { lat: 0, lng: 181 },
      { lat: NaN, lng: 0 },
      { lat: '1', lng: 2 },
    ])
      expect(isLatLng(bad)).toBe(false);
  });

  it('bounds the points, west-south to east-north, or nothing for none', () => {
    expect(boundsOf([])).toBeUndefined();
    expect(
      boundsOf([
        { lat: 38.7, lng: -9.1 },
        { lat: 52.5, lng: 13.4 },
        { lat: 35.7, lng: 139.7 },
      ]),
    ).toEqual([
      [-9.1, 35.7],
      [139.7, 52.5],
    ]);
  });

  it('draws a line through the points with longitude first', () => {
    expect(
      lineFeature([
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ]).geometry.coordinates,
    ).toEqual([
      [2, 1],
      [4, 3],
    ]);
  });
});

describe('grouping markers that are close', () => {
  it('keeps a marker alone in its cell as itself and joins the ones that share one', () => {
    const groups = groupMarkers(
      [
        { id: 'a', x: 10, y: 10 },
        { id: 'b', x: 20, y: 30 },
        { id: 'c', x: 400, y: 400 },
      ],
      56,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ kind: 'cluster', ids: ['a', 'b'], x: 15, y: 20 });
    expect(groups[1]).toEqual({ kind: 'point', id: 'c' });
  });

  it('separates them when they are further apart on the screen, as zooming in does', () => {
    const near = groupMarkers([
      { id: 'a', x: 10, y: 10 },
      { id: 'b', x: 40, y: 10 },
    ]);
    const far = groupMarkers([
      { id: 'a', x: 10, y: 10 },
      { id: 'b', x: 400, y: 10 },
    ]);
    expect(near).toHaveLength(1);
    expect(far.map((group) => group.kind)).toEqual(['point', 'point']);
  });

  it('gives the same group the same key, and is the same for the same input', () => {
    const input = [
      { id: 'a', x: 1, y: 1 },
      { id: 'b', x: 2, y: 2 },
    ];
    expect(groupMarkers(input)).toEqual(groupMarkers(input));
    const [group] = groupMarkers(input);
    expect(group?.kind === 'cluster' ? group.key : '').toBe('c:a,b');
  });

  it('says how many places a cluster holds', () => {
    expect(clusterLabel(12)).toContain('12 places');
  });
});
