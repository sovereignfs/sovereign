import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';
import type { BadgeStatus } from './Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Compact label for roles (`role`), lifecycle states (`status`), and type/version tags (`mono`). RSC-safe — no state.',
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['role', 'status', 'mono'] },
    status: {
      control: 'select',
      options: ['active', 'enabled', 'deactivated', 'failed', 'invited', 'pending', 'neutral'],
    },
  },
  args: { children: 'Badge' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Role: Story = { args: { variant: 'role', children: 'Owner' } };
export const RoleAdmin: Story = { args: { variant: 'role', children: 'Admin' } };
export const RoleUser: Story = { args: { variant: 'role', children: 'User' } };
export const RoleAuditor: Story = { args: { variant: 'role', children: 'Auditor' } };

export const StatusActive: Story = {
  args: { variant: 'status', status: 'active', children: 'Active' },
};
export const StatusDeactivated: Story = {
  args: { variant: 'status', status: 'deactivated', children: 'Deactivated' },
};
export const StatusInvited: Story = {
  args: { variant: 'status', status: 'invited', children: 'Invited' },
};
export const StatusFailed: Story = {
  args: { variant: 'status', status: 'failed', children: 'Failed' },
};
export const StatusPending: Story = {
  args: { variant: 'status', status: 'pending', children: 'Pending' },
};

export const MonoPlatform: Story = { args: { variant: 'mono', children: 'platform' } };
export const MonoCommunity: Story = { args: { variant: 'mono', children: 'community' } };
export const MonoVersion: Story = { args: { variant: 'mono', children: 'v0.1.0' } };

/** All variants and statuses at a glance. */
export const AllVariants: Story = {
  render: (_args) => {
    const roleLabels = ['Owner', 'Admin', 'User', 'Auditor'];
    const statuses: { status: BadgeStatus; label: string }[] = [
      { status: 'active', label: 'Active' },
      { status: 'enabled', label: 'Enabled' },
      { status: 'deactivated', label: 'Deactivated' },
      { status: 'failed', label: 'Failed' },
      { status: 'invited', label: 'Invited' },
      { status: 'pending', label: 'Pending' },
      { status: 'neutral', label: 'Neutral' },
    ];
    const monoLabels = ['platform', 'community', 'serve-route', 'v0.1.0', 'admin-only'];

    const groupStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
    const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
    const headingStyle: React.CSSProperties = {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: 'var(--sv-color-text-muted)',
      fontFamily: 'var(--sv-font-family)',
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 16 }}>
        <div style={sectionStyle}>
          <span style={headingStyle}>Role</span>
          <div style={groupStyle}>
            {roleLabels.map((l) => (
              <Badge key={l} variant="role">
                {l}
              </Badge>
            ))}
          </div>
        </div>
        <div style={sectionStyle}>
          <span style={headingStyle}>Status</span>
          <div style={groupStyle}>
            {statuses.map(({ status, label }) => (
              <Badge key={status} variant="status" status={status}>
                {label}
              </Badge>
            ))}
          </div>
        </div>
        <div style={sectionStyle}>
          <span style={headingStyle}>Mono</span>
          <div style={groupStyle}>
            {monoLabels.map((l) => (
              <Badge key={l} variant="mono">
                {l}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  },
};
