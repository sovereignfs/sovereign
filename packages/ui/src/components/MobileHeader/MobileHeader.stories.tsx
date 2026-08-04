import type { Meta, StoryObj } from '@storybook/react-vite';
import { MobileHeader } from './MobileHeader';
import { Avatar } from '../Avatar/Avatar';
import { Icon } from '../Icon/Icon';

function Logo() {
  return (
    <span
      aria-label="Home"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--sv-radius-sm)',
        background: 'var(--sv-color-accent)',
        color: 'var(--sv-color-text-on-accent)',
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      S
    </span>
  );
}

const meta = {
  title: 'Components/MobileHeader',
  component: MobileHeader,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Mobile shell header content row (RFC 0088). Logo, bell, and avatarMenu are always rendered by the consumer — the optional title is the only overridable part. Presentational only, no data fetching. See Overview/Mobile Patterns for the full immutable/overridable boundary.',
      },
    },
  },
  args: {
    logo: <Logo />,
    bell: <Icon name="bell" size="md" aria-label="Notifications" />,
    avatarMenu: <Avatar name="Jamie Doe" size="sm" />,
  },
} satisfies Meta<typeof MobileHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithTitle: Story = {
  args: {
    title: 'Tasks',
  },
};
