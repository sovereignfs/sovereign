import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SystemBanner } from './SystemBanner';

const meta = {
  title: 'Components/SystemBanner',
  component: SystemBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full-width `position: sticky` strip for platform-level notices. Stack multiple banners by rendering multiple `<SystemBanner>` elements. Dismiss button only appears when `onDismiss` is provided.',
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['info', 'warning', 'error'] },
  },
  args: {
    children: 'Notice',
  },
} satisfies Meta<typeof SystemBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Info: Story = {
  args: {
    variant: 'info',
    children: 'Platform is in read-only mode during migration.',
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: 'License for Example: Monetized expires in 7 days.',
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    children: 'Maintenance mode is active — only admins can sign in.',
  },
};

export const Dismissible: Story = {
  render: (_args) => {
    const [visible, setVisible] = useState(true);
    return visible ? (
      <SystemBanner variant="warning" onDismiss={() => setVisible(false)}>
        License for Example: Monetized expires in 7 days.
      </SystemBanner>
    ) : (
      <div
        style={{
          padding: 16,
          fontFamily: 'var(--sv-font-family)',
          fontSize: 'var(--sv-font-size-sm)',
          color: 'var(--sv-color-text-muted)',
        }}
      >
        Banner dismissed.
      </div>
    );
  },
};

/** All three variants stacked — as they appear when multiple notices are active. */
export const Stacked: Story = {
  render: (_args) => (
    <div>
      <SystemBanner variant="error">
        Maintenance mode is active — only admins can sign in.
      </SystemBanner>
      <SystemBanner variant="warning">
        License for Example: Monetized expires in 7 days.
      </SystemBanner>
      <SystemBanner variant="info">Platform is in read-only mode during migration.</SystemBanner>
    </div>
  ),
};
