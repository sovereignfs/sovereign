// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * MapLibre needs WebGL, which jsdom has not, so it is replaced by a fake that records what the component asks of it and lets a test send it events. What is tested is the component's wiring: what it
 * hands the map, what it draws, and what it does with a click. The pure parts (which requests are allowed, grouping) have tests of their own in `mapModel.test.ts`.
 */
const lib = vi.hoisted(() => {
  type Handler = (event?: unknown) => void;
  /** The options the component passes, as far as the tests read them. */
  interface MapOptions {
    container: HTMLElement;
    style: string;
    transformRequest: (url: string) => { url: string };
    attributionControl: { compact: boolean; customAttribution?: string[] };
  }
  const state = {
    maps: [] as FakeMap[],
    setWorkerUrl: vi.fn(),
  };
  class FakeMarker {
    element: HTMLElement;
    lngLat: [number, number] = [0, 0];
    removed = false;
    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
    }
    setLngLat(value: [number, number]) {
      this.lngLat = value;
      return this;
    }
    addTo(map: FakeMap) {
      map.container.appendChild(this.element);
      return this;
    }
    remove() {
      this.removed = true;
      this.element.remove();
    }
  }
  class FakeMap {
    options: MapOptions;
    container: HTMLElement;
    handlers: Record<string, Handler[]> = {};
    sources: Record<string, { data: unknown; setData: ReturnType<typeof vi.fn> }> = {};
    layers: Record<string, unknown> = {};
    fitBounds = vi.fn();
    easeTo = vi.fn();
    setStyle = vi.fn();
    removed = false;
    center = { lat: 12, lng: 34 };
    constructor(options: MapOptions) {
      this.options = options;
      this.container = options.container;
      state.maps.push(this);
      queueMicrotask(() => {
        this.emit('style.load');
        this.emit('load');
      });
    }
    on(event: string, handler: Handler) {
      (this.handlers[event] ??= []).push(handler);
    }
    off(event: string, handler: Handler) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((each) => each !== handler);
    }
    emit(event: string, payload?: unknown) {
      for (const handler of this.handlers[event] ?? []) handler(payload);
    }
    remove() {
      this.removed = true;
    }
    project([lng, lat]: [number, number]) {
      return { x: lng * 100, y: lat * 100 };
    }
    unproject([x, y]: [number, number]) {
      return { lng: x / 100, lat: y / 100 };
    }
    getCenter() {
      return this.center;
    }
    getSource(id: string) {
      return this.sources[id];
    }
    addSource(id: string, source: { data: unknown }) {
      this.sources[id] = { data: source.data, setData: vi.fn() };
    }
    removeSource(id: string) {
      Reflect.deleteProperty(this.sources, id);
    }
    getLayer(id: string) {
      return this.layers[id];
    }
    addLayer(layer: { id: string }) {
      this.layers[layer.id] = layer;
    }
    removeLayer(id: string) {
      Reflect.deleteProperty(this.layers, id);
    }
  }
  return { state, FakeMap, FakeMarker };
});

vi.mock('maplibre-gl', () => {
  return { Map: lib.FakeMap, Marker: lib.FakeMarker, setWorkerUrl: lib.state.setWorkerUrl };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import { Map } from '../Map';

const A = { id: 'a', lat: 1, lng: 1, label: 'Café da Beira' };
const B = { id: 'b', lat: 5, lng: 5, label: 'Jardim da Estrela', tone: 'success' as const };
const STYLE = 'https://waymark.example.org/api/map/style.json';

function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

async function mounted(ui: React.ReactElement) {
  const result = render(ui);
  await waitFor(() => expect(lib.state.maps).toHaveLength(1));
  const map = lib.state.maps[0] as InstanceType<typeof lib.FakeMap>;
  // The fake's `load` is sent in a microtask; wait for the component to have seen it.
  await act(async () => {
    await Promise.resolve();
  });
  return { ...result, map };
}

beforeEach(() => {
  lib.state.maps.length = 0;
  lib.state.setWorkerUrl.mockClear();
  installMatchMedia();
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('Map', () => {
  it('is a labelled region, and makes the map from the style it is given', async () => {
    const { map } = await mounted(<Map styleUrl={STYLE} ariaLabel="Where you have been" />);
    expect(screen.getByRole('region', { name: 'Where you have been' })).toBeTruthy();
    expect(map.options.style).toBe(STYLE);
    expect(map.options.attributionControl.compact).toBe(true);
  });

  it('adds the attribution it is given to the style’s own', async () => {
    const { map } = await mounted(
      <Map styleUrl={STYLE} ariaLabel="Map" attribution={['© The tiles', '© The data']} />,
    );
    expect(map.options.attributionControl.customAttribution).toEqual(['© The tiles', '© The data']);
  });

  it('serves MapLibre’s worker from the address the app gives', async () => {
    await mounted(<Map styleUrl={STYLE} ariaLabel="Map" workerUrl="/maplibre-worker.mjs" />);
    expect(lib.state.setWorkerUrl).toHaveBeenCalledWith('/maplibre-worker.mjs');
  });

  it('turns every request to an address the app did not give into one that cannot succeed', async () => {
    const { map } = await mounted(<Map styleUrl={STYLE} ariaLabel="Map" />);
    const transform = map.options.transformRequest as (url: string) => { url: string };
    expect(transform('https://waymark.example.org/api/map/tiles/1/2/3.pbf').url).toBe(
      'https://waymark.example.org/api/map/tiles/1/2/3.pbf',
    );
    expect(transform('https://tiles.third-party.example/1/2/3.pbf').url).toBe('data:,');
    expect(transform('https://fonts.third-party.example/Noto.pbf').url).toBe('data:,');
  });

  it('lets an origin through when the app lists it', async () => {
    const { map } = await mounted(
      <Map styleUrl={STYLE} ariaLabel="Map" allowedOrigins={['https://tiles.partner.example']} />,
    );
    const transform = map.options.transformRequest as (url: string) => { url: string };
    expect(transform('https://tiles.partner.example/1.pbf').url).toBe(
      'https://tiles.partner.example/1.pbf',
    );
  });

  it('draws each marker as a button with its label, and tells the app which was chosen', async () => {
    const onMarkerSelect = vi.fn();
    await mounted(
      <Map styleUrl={STYLE} ariaLabel="Map" markers={[A, B]} onMarkerSelect={onMarkerSelect} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Jardim da Estrela' }));
    expect(onMarkerSelect).toHaveBeenCalledWith('b');
    expect(screen.getByRole('button', { name: 'Café da Beira' })).toBeTruthy();
  });

  it('groups markers that are close, with a count that says so, and zooms into them when chosen', async () => {
    const near = [
      { id: 'a', lat: 0.1, lng: 0.1, label: 'One' },
      { id: 'b', lat: 0.2, lng: 0.2, label: 'Two' },
      { id: 'c', lat: 50, lng: 50, label: 'Far away' },
    ];
    const { map } = await mounted(<Map styleUrl={STYLE} ariaLabel="Map" markers={near} cluster />);
    const group = await screen.findByRole('button', { name: /2 places close together/ });
    expect(group.textContent).toBe('2');
    expect(screen.getByRole('button', { name: 'Far away' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'One' })).toBeNull();
    map.fitBounds.mockClear();
    fireEvent.click(group);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0]?.[0]).toEqual([
      [0.1, 0.1],
      [0.2, 0.2],
    ]);
  });

  it('draws a line, changes it, and takes it away', async () => {
    const { map, rerender } = await mounted(
      <Map
        styleUrl={STYLE}
        ariaLabel="Map"
        line={[
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
        ]}
      />,
    );
    expect(Object.keys(map.layers)).toEqual(['sv-map-line-layer']);
    rerender(
      <Map
        styleUrl={STYLE}
        ariaLabel="Map"
        line={[
          { lat: 1, lng: 2 },
          { lat: 5, lng: 6 },
        ]}
      />,
    );
    expect(map.sources['sv-map-line']?.setData).toHaveBeenCalled();
    rerender(<Map styleUrl={STYLE} ariaLabel="Map" line={[{ lat: 1, lng: 2 }]} />);
    expect(map.layers).toEqual({});
    expect(map.sources).toEqual({});
  });

  it('fits to its points at the start, a lone point by centring on it, and again when the key changes', async () => {
    const { map, rerender } = await mounted(
      <Map styleUrl={STYLE} ariaLabel="Map" markers={[A, B]} fitKey={1} />,
    );
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.fitBounds.mock.calls[0]?.[0]).toEqual([
      [1, 1],
      [5, 5],
    ]);
    rerender(<Map styleUrl={STYLE} ariaLabel="Map" markers={[A, B]} fitKey={2} />);
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    rerender(<Map styleUrl={STYLE} ariaLabel="Map" markers={[A]} fitKey={3} />);
    expect(map.easeTo).toHaveBeenCalledTimes(1);
    expect(map.easeTo.mock.calls[0]?.[0]).toMatchObject({ center: [1, 1] });
  });

  it('does not move the map when only the markers change', async () => {
    const { map, rerender } = await mounted(
      <Map styleUrl={STYLE} ariaLabel="Map" markers={[A]} fitKey={1} />,
    );
    const before = map.easeTo.mock.calls.length + map.fitBounds.mock.calls.length;
    rerender(<Map styleUrl={STYLE} ariaLabel="Map" markers={[A, B]} fitKey={1} />);
    expect(map.easeTo.mock.calls.length + map.fitBounds.mock.calls.length).toBe(before);
  });

  it('shows the person’s position as a dot, named, and takes it away', async () => {
    const { rerender } = await mounted(
      <Map styleUrl={STYLE} ariaLabel="Map" position={{ lat: 1, lng: 2, accuracyM: 20 }} />,
    );
    expect(screen.getByRole('img', { name: 'Your position' })).toBeTruthy();
    rerender(<Map styleUrl={STYLE} ariaLabel="Map" position={null} />);
    expect(screen.queryByRole('img', { name: 'Your position' })).toBeNull();
  });

  it('chooses a point by a click, or by Enter on the focused map, and only when choosing', async () => {
    const onPick = vi.fn();
    const { map } = await mounted(<Map styleUrl={STYLE} ariaLabel="Map" pick={{ onPick }} />);
    act(() => map.emit('click', { lngLat: { lat: 38.7, lng: -9.1 } }));
    expect(onPick).toHaveBeenLastCalledWith({ lat: 38.7, lng: -9.1 });
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith({ lat: 12, lng: 34 });
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  it('chooses nothing when it is not for choosing, and shows the point chosen as a pin', async () => {
    const { map, rerender } = await mounted(<Map styleUrl={STYLE} ariaLabel="Map" />);
    act(() => map.emit('click', { lngLat: { lat: 1, lng: 1 } }));
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Enter' });
    rerender(
      <Map
        styleUrl={STYLE}
        ariaLabel="Map"
        pick={{ value: { lat: 3, lng: 4 }, onPick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Chosen point' })).toBeTruthy();
  });

  it('does not take a key on a marker for choosing the middle', async () => {
    const onPick = vi.fn();
    await mounted(<Map styleUrl={STYLE} ariaLabel="Map" markers={[A]} pick={{ onPick }} />);
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Café da Beira' }), {
      key: 'Enter',
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('changes the style when it is given another, and not otherwise', async () => {
    const { map, rerender } = await mounted(<Map styleUrl={STYLE} ariaLabel="Map" />);
    rerender(<Map styleUrl={STYLE} ariaLabel="Map" />);
    expect(map.setStyle).not.toHaveBeenCalled();
    rerender(
      <Map styleUrl="https://waymark.example.org/api/map/style-dark.json" ariaLabel="Map" />,
    );
    expect(map.setStyle).toHaveBeenCalledWith(
      'https://waymark.example.org/api/map/style-dark.json',
    );
  });

  it('reports a map that cannot load without saying where from', async () => {
    const onError = vi.fn();
    const { map } = await mounted(<Map styleUrl={STYLE} ariaLabel="Map" onError={onError} />);
    act(() => map.emit('error', { error: new Error('https://waymark.example.org/secret failed') }));
    expect(onError).toHaveBeenCalledWith('The map could not be loaded.');
  });

  it('removes the map and its markers when it goes', async () => {
    const { map, unmount } = await mounted(
      <Map styleUrl={STYLE} ariaLabel="Map" markers={[A, B]} />,
    );
    expect(await screen.findAllByRole('button')).toHaveLength(2);
    unmount();
    expect(map.removed).toBe(true);
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });
});
