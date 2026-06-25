import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toggle } from './Toggle';

const meta = {
  title: 'Components/Toggle',
  component: Toggle,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '38×22px binary switch for settings rows. Renders as `<button role="switch">` for reliable VoiceOver support. `aria-label` is required.',
      },
    },
  },
  argTypes: {
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: {
    checked: false,
    onChange: () => {},
    'aria-label': 'Toggle setting',
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Off: Story = { args: { checked: false } };
export const On: Story = { args: { checked: true } };
export const Disabled: Story = { args: { checked: false, disabled: true } };
export const DisabledOn: Story = { args: { checked: true, disabled: true } };

/** Interactive — click to toggle. */
export const Interactive: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(args.checked);
    return <Toggle {...args} checked={checked} onChange={setChecked} />;
  },
};

/** Settings rows — typical usage with adjacent label text. */
export const SettingsRows: Story = {
  render: (_args) => {
    const [twoFA, setTwoFA] = useState(true);
    const [email, setEmail] = useState(false);

    const rowStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 32,
      padding: '12px 0',
      borderBottom: '1px solid var(--sv-color-border)',
      fontFamily: 'var(--sv-font-family)',
    };
    const labelStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    };
    const titleStyle: React.CSSProperties = {
      fontSize: 'var(--sv-font-size-sm)',
      fontWeight: 'var(--sv-font-weight-medium)',
      color: 'var(--sv-color-text-primary)',
    };
    const descStyle: React.CSSProperties = {
      fontSize: 'var(--sv-font-size-caption)',
      color: 'var(--sv-color-text-muted)',
    };

    return (
      <div style={{ width: 320 }}>
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={titleStyle}>Two-factor authentication</span>
            <span style={descStyle}>Require a code when signing in.</span>
          </div>
          <Toggle checked={twoFA} onChange={setTwoFA} aria-label="Two-factor authentication" />
        </div>
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={titleStyle}>Email notifications</span>
            <span style={descStyle}>Receive digests and alerts.</span>
          </div>
          <Toggle checked={email} onChange={setEmail} aria-label="Email notifications" />
        </div>
      </div>
    );
  },
};
