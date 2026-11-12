import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../Badge/Badge';
import { CardTileGrid } from '../CardTile/CardTile';
import { Icon } from '../Icon/Icon';
import { AppTile } from './AppTile';

const meta = {
  title: 'Components/AppTile',
  component: AppTile,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One app in a grid: a rounded icon box, the name, a line about it and, beneath a divider, what kind of app it is. The whole tile is a link when `href` is given. Lay tiles out with `CardTileGrid`.',
      },
    },
  },
  args: {
    name: 'Notes',
    description: 'Journal on this server',
    icon: <Icon name="notebook-pen" size="lg" aria-hidden={true} />,
  },
} satisfies Meta<typeof AppTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: '#',
    tags: (
      <Badge variant="mono" size="sm" uppercase={false}>
        journal
      </Badge>
    ),
  },
};

export const Grid: Story = {
  render: () => (
    <CardTileGrid minTileWidth={220}>
      <AppTile
        href="#"
        name="Console"
        description="Run this instance"
        icon={<Icon name="layout-dashboard" size="lg" aria-hidden={true} />}
        tags={
          <Badge variant="mono" size="sm" uppercase={false}>
            platform
          </Badge>
        }
      />
      <AppTile
        href="#"
        name="A long name that wraps onto a second line"
        description="Journal on this server"
        icon={<Icon name="notebook-pen" size="lg" aria-hidden={true} />}
        tags={
          <Badge variant="mono" size="sm" uppercase={false}>
            sovereign
          </Badge>
        }
      />
      <AppTile
        variant="ghost"
        href="#"
        name="Add an app"
        description="Register one for this instance"
        icon={<Icon name="plus" size="lg" aria-hidden={true} />}
      />
      <AppTile href="#" name="No tags" icon={<Icon name="folder" size="lg" aria-hidden={true} />} />
    </CardTileGrid>
  ),
};
