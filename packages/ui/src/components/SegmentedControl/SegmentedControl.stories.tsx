import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from './SegmentedControl';

const meta = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Pill-based 2–3 option picker for inline use in table rows and dialogs. Renders as `role="radiogroup"` with `role="radio"` segments.',
      },
    },
  },
  args: {
    value: 'a',
    onChange: () => {},
    options: [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ],
    'aria-label': 'Select option',
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const TwoOption: Story = {
  render: (_args) => {
    const [role, setRole] = useState<'user' | 'admin'>('user');
    return (
      <SegmentedControl
        value={role}
        onChange={setRole}
        options={[
          { label: 'User', value: 'user' },
          { label: 'Admin', value: 'admin' },
        ]}
        aria-label="Role"
      />
    );
  },
};

export const ThreeOption: Story = {
  render: (_args) => {
    const [role, setRole] = useState<'user' | 'admin' | 'owner'>('user');
    return (
      <SegmentedControl
        value={role}
        onChange={setRole}
        options={[
          { label: 'User', value: 'user' },
          { label: 'Admin', value: 'admin' },
          { label: 'Owner', value: 'owner' },
        ]}
        aria-label="Role"
      />
    );
  },
};

export const SmallSize: Story = {
  render: (_args) => {
    const [role, setRole] = useState<'user' | 'admin'>('user');
    return (
      <SegmentedControl
        value={role}
        onChange={setRole}
        size="sm"
        options={[
          { label: 'User', value: 'user' },
          { label: 'Admin', value: 'admin' },
        ]}
        aria-label="Role"
      />
    );
  },
};

/** Table-row context — sm size next to other table content. */
export const InTableRow: Story = {
  render: (_args) => {
    const [role, setRole] = useState<'user' | 'admin'>('user');
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 12px',
          border: '1px solid var(--sv-color-border)',
          borderRadius: 'var(--sv-radius-md)',
          fontFamily: 'var(--sv-font-family)',
          fontSize: 'var(--sv-font-size-sm)',
          color: 'var(--sv-color-text-primary)',
        }}
      >
        <span>Test User</span>
        <SegmentedControl
          value={role}
          onChange={setRole}
          size="sm"
          options={[
            { label: 'User', value: 'user' },
            { label: 'Admin', value: 'admin' },
          ]}
          aria-label="User role"
        />
      </div>
    );
  },
};
