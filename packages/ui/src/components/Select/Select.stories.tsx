import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select';

const meta = {
  title: 'Components/Select',
  component: Select,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Styled native `<select>` — same visual language as `Input`. Preserves native picker on mobile for maximum accessibility. RSC-safe.',
      },
    },
  },
  argTypes: {
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: (_args) => (
    <div style={{ width: 280, fontFamily: 'var(--sv-font-family)' }}>
      <label
        htmlFor="role-select"
        style={{
          display: 'block',
          marginBottom: 4,
          fontSize: 'var(--sv-font-size-sm)',
          fontWeight: 'var(--sv-font-weight-medium)',
          color: 'var(--sv-color-text-primary)',
        }}
      >
        Role
      </label>
      <Select id="role-select" defaultValue="user">
        <option value="user">User</option>
        <option value="admin">Admin</option>
        <option value="owner">Owner</option>
      </Select>
    </div>
  ),
};

export const Disabled: Story = {
  render: (_args) => (
    <div style={{ width: 280 }}>
      <Select disabled defaultValue="user">
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </Select>
    </div>
  ),
};

/** Form context — several fields together matching the spec layout. */
export const FormContext: Story = {
  render: (_args) => {
    const fieldStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    };
    const labelStyle: React.CSSProperties = {
      fontSize: 'var(--sv-font-size-sm)',
      fontWeight: 'var(--sv-font-weight-medium)',
      color: 'var(--sv-color-text-primary)',
      fontFamily: 'var(--sv-font-family)',
    };

    return (
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={fieldStyle}>
          <label htmlFor="lang-select" style={labelStyle}>
            Language
          </label>
          <Select id="lang-select" defaultValue="en-us">
            <option value="en-us">English (US)</option>
            <option value="en-gb">English (UK)</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
          </Select>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="tz-select" style={labelStyle}>
            Timezone
          </label>
          <Select id="tz-select" defaultValue="asia-colombo">
            <option value="asia-colombo">Asia/Colombo (UTC+5:30)</option>
            <option value="utc">UTC</option>
            <option value="america-ny">America/New_York (UTC−5)</option>
            <option value="europe-london">Europe/London (UTC+0)</option>
          </Select>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="poll-select" style={labelStyle}>
            Poll interval
          </label>
          <Select id="poll-select" defaultValue="30">
            <option value="15">Every 15 seconds</option>
            <option value="30">Every 30 seconds</option>
            <option value="60">Every minute</option>
            <option value="300">Every 5 minutes</option>
          </Select>
        </div>
      </div>
    );
  },
};
