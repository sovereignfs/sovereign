import type { Meta, StoryObj } from '@storybook/react-vite';
import { HoverCard } from './HoverCard';
import { Avatar } from '../Avatar/Avatar';

const meta = {
  title: 'Components/HoverCard',
  component: HoverCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Hover-triggered popover on desktop, tap-to-toggle on touch. Built on Popover for positioning/collision detection — this only adds hover-intent timing and the touch fallback. Opens on keyboard focus too.',
      },
    },
  },
  args: { trigger: <span />, children: null, 'aria-label': 'Preview' },
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: () => (
    <HoverCard
      aria-label="User preview"
      trigger={
        <button
          type="button"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <Avatar name="Jane Smith" size="sm" />
        </button>
      }
    >
      <div style={{ padding: 'var(--sv-space-3)', fontSize: 14 }}>
        <div style={{ fontWeight: 600 }}>Jane Smith</div>
        <div style={{ color: 'var(--sv-color-text-muted)' }}>jane@example.com</div>
      </div>
    </HoverCard>
  ),
};

export const WithLink: Story = {
  render: () => (
    <p style={{ fontSize: 14 }}>
      Assigned to{' '}
      <HoverCard
        aria-label="Assignee preview"
        trigger={
          <a href="/console/users/jane-smith" style={{ color: 'var(--sv-color-text-primary)' }}>
            Jane Smith
          </a>
        }
      >
        <div style={{ padding: 'var(--sv-space-3)', fontSize: 14 }}>
          <div style={{ fontWeight: 600 }}>Jane Smith</div>
          <div style={{ color: 'var(--sv-color-text-muted)' }}>12 tasks completed this month</div>
        </div>
      </HoverCard>
      .
    </p>
  ),
};
