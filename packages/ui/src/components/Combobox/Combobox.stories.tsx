import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Combobox } from './Combobox';

const OPTIONS = [
  { value: 'tasks', label: 'sovereign-tasks' },
  { value: 'ledger', label: 'sovereign-ledger' },
  { value: 'shopper', label: 'sovereign-shopper' },
  { value: 'healthlog', label: 'sovereign-healthlog' },
  { value: 'plainwrite', label: 'sovereign-plainwrite' },
];

const meta = {
  title: 'Components/Combobox',
  component: Combobox,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "A searchable single-select: Popover on desktop, a bottom-sheet Drawer on mobile — the same adaptive pattern as Menu and DatePicker. For a short fixed list where search adds no value, use Select's native <select> instead.",
      },
    },
  },
  args: { options: OPTIONS, value: null, onChange: () => {}, 'aria-label': 'Plugin' },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

function ComboboxDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div style={{ width: 280 }}>
      <Combobox
        options={OPTIONS}
        value={value}
        onChange={setValue}
        placeholder="Select a plugin"
        aria-label="Plugin"
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <ComboboxDemo />,
};

export const Preselected: Story = {
  render: () => {
    function Demo() {
      const [value, setValue] = useState<string | null>('ledger');
      return (
        <div style={{ width: 280 }}>
          <Combobox options={OPTIONS} value={value} onChange={setValue} aria-label="Plugin" />
        </div>
      );
    }
    return <Demo />;
  },
};

export const Disabled: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        placeholder="Select a plugin"
        aria-label="Plugin"
        disabled
      />
    </div>
  ),
};
