import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PhotoGallery, PhotoGrid } from '../components/PhotoViewer/PhotoGrid';
import { type Photo, PhotoViewer } from '../components/PhotoViewer/PhotoViewer';

/** Pictures drawn on the spot as `data:` addresses, so the stories need no network. */
const picture = (hue: number, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="hsl(${hue} 55% 62%)"/><circle cx="880" cy="230" r="90" fill="hsl(${hue + 40} 90% 88%)"/><polygon points="0,800 380,360 760,800" fill="hsl(${hue} 40% 36%)"/><text x="60" y="110" font-size="64" fill="white" font-family="sans-serif">${label}</text></svg>`,
  )}`;

const photos: Photo[] = [
  ['Harbour', 210],
  ['Tram', 20],
  ['Bakery', 40],
  ['Garden', 120],
  ['Station', 280],
  ['Market', 340],
  ['Bridge', 180],
].map(([name, hue], index) => ({
  id: `p${index}`,
  src: picture(Number(hue), String(name)),
  alt: `${String(name)}, drawn for the story`,
  caption: `${String(name)} · ${index + 1} May`,
}));

const meta = {
  title: 'Components/PhotoViewer',
  component: PhotoViewer,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PhotoViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The grid and the viewer together: choose a thumbnail, swipe or use the arrow keys, pinch or double-tap to zoom, `Esc` to close. */
export const Gallery: Story = {
  args: { photos, open: false, index: 0, onIndexChange: () => {}, onClose: () => {} },
  render: () => <PhotoGallery photos={photos} />,
};

export const Grid: Story = {
  args: { photos, open: false, index: 0, onIndexChange: () => {}, onClose: () => {} },
  render: () => <PhotoGrid photos={photos} onOpen={() => {}} />,
};

export const ViewerOpen: Story = {
  args: { photos, open: true, index: 2, onIndexChange: () => {}, onClose: () => {} },
  render: (args) => {
    const [index, setIndex] = useState(args.index);
    return <PhotoViewer {...args} index={index} onIndexChange={setIndex} />;
  },
};
