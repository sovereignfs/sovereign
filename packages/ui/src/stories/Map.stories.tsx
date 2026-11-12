import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { type LatLng, Map } from '../map';

/**
 * A style with no tiles at all, as a `data:` address, so that the stories need no network and no server: a real app passes the address of a style its own server makes (`/api/map`). The map's
 * markers, line and position are drawn by the component, not by the style, so they show on it as they would on any. The worker is served by the bundler (`?url`), as an app serves it from its
 * own origin (`workerUrl`).
 */
const style = (background: string) =>
  `data:application/json,${encodeURIComponent(
    JSON.stringify({
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': background } }],
    }),
  )}`;
const LIGHT = style('#e8edf2');
const DARK = style('#1c2229');

const places = [
  { id: 'lisbon', lat: 38.7223, lng: -9.1393, label: 'Lisbon' },
  { id: 'porto', lat: 41.1579, lng: -8.6291, label: 'Porto', tone: 'success' as const },
  { id: 'madrid', lat: 40.4168, lng: -3.7038, label: 'Madrid', tone: 'warning' as const },
  { id: 'seville', lat: 37.3891, lng: -5.9845, label: 'Seville', selected: true },
  { id: 'faro', lat: 37.0194, lng: -7.9304, label: 'Faro' },
];

const meta = {
  title: 'Components/Map',
  component: Map,
  parameters: { layout: 'fullscreen' },
  args: { styleUrl: LIGHT, ariaLabel: 'Places in Iberia', markers: places, fitKey: 1, workerUrl },
  decorators: [
    (Story) => (
      <div style={{ height: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Map>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Markers: Story = {};

export const Clustered: Story = {
  args: {
    cluster: true,
    markers: [
      ...places,
      { id: 'a', lat: 38.73, lng: -9.15, label: 'Alfama' },
      { id: 'b', lat: 38.71, lng: -9.13, label: 'Baixa' },
      { id: 'c', lat: 38.7, lng: -9.16, label: 'Belém' },
    ],
  },
};

export const WithLine: Story = {
  args: { line: places.map(({ lat, lng }) => ({ lat, lng })) },
};

export const YourPosition: Story = {
  args: {
    markers: [],
    line: [],
    position: { lat: 38.7223, lng: -9.1393 },
    center: { lat: 38.72, lng: -9.14 },
    zoom: 13,
  },
};

export const Dark: Story = {
  args: { styleUrl: DARK, line: places.map(({ lat, lng }) => ({ lat, lng })) },
};

export const ChoosingAPoint: Story = {
  args: { markers: [], center: { lat: 39.5, lng: -8 }, zoom: 5 },
  render: (args) => {
    const [value, setValue] = useState<LatLng | null>(null);
    return (
      <div style={{ height: '100%', position: 'relative' }}>
        <Map {...args} pick={{ value, onPick: setValue }} />
        <p
          style={{
            position: 'absolute',
            insetInline: 8,
            bottom: 8,
            margin: 0,
            padding: 8,
            background: 'var(--sv-color-surface)',
          }}
        >
          {value
            ? `Chosen: ${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`
            : 'Click the map, or focus it and press Enter.'}
        </p>
      </div>
    );
  },
};
