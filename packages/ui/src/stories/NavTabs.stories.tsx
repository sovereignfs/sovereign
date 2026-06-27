import type { Meta, StoryObj } from '@storybook/react-vite';
import { NavTabs } from '../components/NavTabs/NavTabs';

const items = [
  { label: 'Overview', href: '#overview', active: true },
  { label: 'Users', href: '#users' },
  { label: 'Plugins', href: '#plugins' },
  { label: 'Settings', href: '#settings' },
];

const meta = {
  title: 'Components/NavTabs',
  component: NavTabs,
  parameters: { layout: 'padded' },
  args: { items },
} satisfies Meta<typeof NavTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ManyTabs: Story = {
  args: {
    items: [
      { label: 'Profile', href: '#profile', active: true },
      { label: 'Security', href: '#security' },
      { label: 'Notifications', href: '#notifications' },
      { label: 'Preferences', href: '#preferences' },
      { label: 'Data & Privacy', href: '#data' },
      { label: 'Sessions', href: '#sessions' },
    ],
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
