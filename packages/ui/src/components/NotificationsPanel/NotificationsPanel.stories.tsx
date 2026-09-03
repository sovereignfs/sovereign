import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationsPanel } from './NotificationsPanel';
import { Icon } from '../Icon/Icon';

const items = [
  {
    id: '1',
    icon: <Icon name="layers" size="sm" aria-hidden />,
    title: 'Added to a project',
    timeLabel: '2d ago',
    read: false,
    onDismiss: () => {},
  },
  {
    id: '2',
    icon: <Icon name="user-round-plus" size="sm" aria-hidden />,
    title: 'Jamie invited you to Notes',
    timeLabel: '3d ago',
    read: true,
    href: '/notes',
    onDismiss: () => {},
  },
];

const meta = {
  title: 'Components/NotificationsPanel',
  component: NotificationsPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          "The bell trigger + dropdown, generalized from the runtime shell's own NotificationBell. Pure presentation — no fetch/SSE/mark-read logic; the consumer supplies already-resolved items and wires onOpen/onDismiss/onMarkAllRead/onClearAll.",
      },
    },
  },
  args: {
    items,
    unreadCount: 1,
    onMarkAllRead: () => {},
    onClearAll: () => {},
  },
} satisfies Meta<typeof NotificationsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    items: [],
    unreadCount: 0,
  },
};

export const WithViewAll: Story = {
  args: {
    viewAllHref: '/inbox',
  },
};
