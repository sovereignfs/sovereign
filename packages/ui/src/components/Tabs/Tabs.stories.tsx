import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Underline tab nav. Stateless — caller owns `value` + `onChange` and renders the active panel. Mobile: scrolls horizontally with the scrollbar hidden.',
      },
    },
  },
  args: {
    items: [{ label: 'Tab', value: 'tab' }],
    value: 'tab',
    onChange: () => {},
    'aria-label': 'Tabs',
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

const CONSOLE_TABS = [
  { label: 'Overview', value: 'overview' },
  { label: 'Users', value: 'users' },
  { label: 'Plugins', value: 'plugins' },
  { label: 'Settings', value: 'settings' },
  { label: 'Health', value: 'health' },
];

const ACCOUNT_TABS = [
  { label: 'Profile', value: 'profile' },
  { label: 'Security', value: 'security' },
  { label: 'Appearance', value: 'appearance' },
  { label: 'Notifications', value: 'notifications' },
  { label: 'Billing', value: 'billing' },
  { label: 'Data', value: 'data' },
];

/** Console panel navigation. */
export const Console: Story = {
  render: (_args) => {
    const [tab, setTab] = useState('overview');
    return (
      <div style={{ fontFamily: 'var(--sv-font-family)' }}>
        <Tabs items={CONSOLE_TABS} value={tab} onChange={setTab} aria-label="Console" />
        <div
          style={{
            padding: 'var(--sv-space-4)',
            color: 'var(--sv-color-text-muted)',
            fontSize: 'var(--sv-font-size-sm)',
          }}
        >
          Showing: <strong style={{ color: 'var(--sv-color-text-primary)' }}>{tab}</strong>
        </div>
      </div>
    );
  },
};

/** Account settings — more tabs, scrolls on narrow viewports. */
export const Account: Story = {
  render: (_args) => {
    const [tab, setTab] = useState('profile');
    return (
      <div style={{ fontFamily: 'var(--sv-font-family)', maxWidth: 480 }}>
        <Tabs items={ACCOUNT_TABS} value={tab} onChange={setTab} aria-label="Account settings" />
        <div
          style={{
            padding: 'var(--sv-space-4)',
            color: 'var(--sv-color-text-muted)',
            fontSize: 'var(--sv-font-size-sm)',
          }}
        >
          Showing: <strong style={{ color: 'var(--sv-color-text-primary)' }}>{tab}</strong>
        </div>
      </div>
    );
  },
};

/** Narrow viewport — confirms horizontal scroll behaviour. */
export const NarrowScroll: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: (_args) => {
    const [tab, setTab] = useState('profile');
    return (
      <div style={{ fontFamily: 'var(--sv-font-family)' }}>
        <Tabs items={ACCOUNT_TABS} value={tab} onChange={setTab} aria-label="Account settings" />
      </div>
    );
  },
};
