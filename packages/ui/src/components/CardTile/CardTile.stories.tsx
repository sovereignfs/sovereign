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

export const NewTile: StoryObj<typeof NewCardTile> = {
  render: () => <NewCardTile label="New document" />,
};
