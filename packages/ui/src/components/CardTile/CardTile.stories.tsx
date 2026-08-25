import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon } from '../Icon/Icon';
import { CardTile, CardTileGrid, NewCardTile } from './CardTile';

const meta = {
  title: 'Components/CardTile',
  component: CardTile,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A colored/iconed banner over a footer label, used as a grid of navigable tiles (projects, boards, and similar top-level entities). Pair with `CardTileGrid` for layout and `NewCardTile` for the grid\'s "add new" affordance. Not link-aware — wrap a tile in the host framework\'s own link component to make it navigable.',
      },
    },
  },
  args: {
    children: 'Q4 Planning',
  },
} satisfies Meta<typeof CardTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBannerIcon: Story = {
  args: {
    banner: <Icon name="folder" size="lg" aria-hidden={true} />,
    children: 'Q4 Planning',
  },
};

export const WithBannerColor: Story = {
  args: {
    bannerColor: '#c7d8ff',
    children: 'Marketing site',
  },
};

export const Grid: Story = {
  render: () => (
    <CardTileGrid>
      <CardTile banner={<Icon name="folder" size="lg" aria-hidden={true} />}>Q4 Planning</CardTile>
      <CardTile bannerColor="#ffd8c7">Design reviews</CardTile>
      <CardTile bannerColor="#c7ffd9">Onboarding</CardTile>
      <NewCardTile label="New project" />
    </CardTileGrid>
  ),
};

/** `variant="icon"` — a plain "Finder icon" tile: no card chrome, just a large centered icon with a label beneath it. */
export const IconVariant: Story = {
  args: {
    variant: 'icon',
    banner: <Icon name="folder-closed" size="lg" aria-hidden={true} />,
    children: 'Handbook',
  },
};

/** `dense` — natural-width tiles (no stretch-to-fill) with a tighter gap, the pairing `variant="icon"` tiles normally want. `NewCardTile`'s own `variant="icon"` matches the same footprint, so the "add new" tile sits naturally alongside the rest instead of stretching into a wide pill. */
export const IconVariantGrid: Story = {
  render: () => (
    <CardTileGrid dense minTileWidth={100}>
      <CardTile variant="icon" banner={<Icon name="folder-closed" size="lg" aria-hidden={true} />}>
        Handbook
      </CardTile>
      <CardTile variant="icon" banner={<Icon name="folder-closed" size="lg" aria-hidden={true} />}>
        Q4 Planning
      </CardTile>
      <CardTile variant="icon" banner={<Icon name="folder-closed" size="lg" aria-hidden={true} />}>
        Design reviews
      </CardTile>
      <NewCardTile variant="icon" label="New" />
    </CardTileGrid>
  ),
};

export const NewTile: StoryObj<typeof NewCardTile> = {
  render: () => <NewCardTile label="New document" />,
};

/** `variant="icon"` — matches a `variant="icon"` `CardTile`'s footprint (icon above a short label) instead of the default horizontal pill. */
export const NewTileIconVariant: StoryObj<typeof NewCardTile> = {
  render: () => <NewCardTile variant="icon" label="New" />,
};
