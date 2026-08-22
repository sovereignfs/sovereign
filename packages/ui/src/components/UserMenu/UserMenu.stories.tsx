import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserMenu } from './UserMenu';

const meta = {
  title: 'Components/UserMenu',
  component: UserMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The account avatar trigger + dropdown, generalized from the runtime shell\'s own AccountMenu — accent-filled avatar, name/email header block, then a plain item list. Presentational only: items carry their own onSelect and/or href. size="md" (36px, default) matches the platform sidebar\'s own avatar; size="sm" (32px) suits the more compact Header top-bar context instead.',
      },
    },
  },
  args: {
    name: 'Kasun Benthara',
    email: 'kasun@openfs.io',
    items: [
      { label: 'Account', icon: 'user', href: '/account' },
      { label: 'Preferences', icon: 'sliders-horizontal', href: '/account/preferences' },
      { label: 'Sign out', icon: 'log-out', destructive: true, onSelect: () => {} },
    ],
  },
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAvatarImage: Story = {
  args: {
    avatarUrl: 'https://i.pravatar.cc/80',
  },
};

export const NoUserInfo: Story = {
  args: {
    name: undefined,
    email: undefined,
  },
};

export const CompactSize: Story = {
  args: {
    size: 'sm',
  },
};
