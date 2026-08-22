import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppsLauncher } from './AppsLauncher';
import { Icon } from '../Icon/Icon';

const items = [
  {
    key: 'home',
    icon: <Icon name="house" size="md" aria-hidden />,
    label: 'Home',
    href: '/launcher',
  },
  {
    key: 'console',
    icon: <Icon name="layout-dashboard" size="md" aria-hidden />,
    label: 'Console',
    href: '/console',
  },
  {
    key: 'notes',
    icon: <Icon name="file" size="md" aria-hidden />,
    label: 'Notes',
    href: '/notes',
  },
];

const meta = {
  title: 'Components/AppsLauncher',
  component: AppsLauncher,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          "The desktop 'Apps' switcher — a 28px grid trigger opening a Popover tile grid. The desktop counterpart to MobileAppsDrawer: same items shape, different chrome. Presentational only — items are supplied already resolved.",
      },
    },
  },
  args: {
    items,
  },
} satisfies Meta<typeof AppsLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const ErrorState: Story = {
  args: {
    error: true,
  },
};
