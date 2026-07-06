import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from './StatusBadge';

const meta = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Compact inline status indicator for draft, sync, conflict, and delete-pending editor workflows.',
      },
    },
  },
  args: {
    status: 'draft',
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sv-space-2)' }}>
      <StatusBadge status="unmodified" />
      <StatusBadge status="draft" />
      <StatusBadge status="committed" />
      <StatusBadge status="synced" />
    </div>
  ),
};

export const ErrorStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sv-space-2)' }}>
      <StatusBadge status="conflict" />
      <StatusBadge status="pending-delete" />
      <StatusBadge status="warning" />
      <StatusBadge status="error" />
    </div>
  ),
};

export const AccessibleLabel: Story = {
  render: () => (
    <StatusBadge status="draft" aria-label="Draft with unpublished changes">
      D
    </StatusBadge>
  ),
};

export const LongContent: Story = {
  render: () => (
    <div style={{ width: 180 }}>
      <StatusBadge status="warning">Preview requires frontmatter migration</StatusBadge>
    </div>
  ),
};

export const MobileWrap: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sv-space-2)', maxWidth: 320 }}>
      <StatusBadge status="draft" />
      <StatusBadge status="synced" />
      <StatusBadge status="conflict" />
      <StatusBadge status="pending-delete" />
    </div>
  ),
};
