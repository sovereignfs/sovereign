import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckableListRow } from './CheckableListRow';
import { Icon } from '../Icon/Icon';

const meta = {
  title: 'Components/CheckableListRow',
  component: CheckableListRow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A whole-row tap target that toggles a checked state, with strike-through on the label when checked — for "tap the row to mark it done" lists.',
      },
    },
  },
  args: {
    checked: false,
    onCheckedChange: () => {},
    label: 'Bananas',
  },
} satisfies Meta<typeof CheckableListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledRow({
  initial = false,
  icon,
  trailing,
  disabled,
}: {
  initial?: boolean;
  icon?: boolean;
  trailing?: boolean;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState(initial);
  return (
    <div style={{ width: 320 }}>
      <CheckableListRow
        checked={checked}
        onCheckedChange={setChecked}
        label="Bananas"
        icon={icon ? <Icon name="banana" size="md" aria-hidden /> : undefined}
        trailing={trailing ? <span style={{ fontSize: 13, color: '#888' }}>6 pcs</span> : undefined}
        disabled={disabled}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <ControlledRow />,
};

export const Checked: Story = {
  render: () => <ControlledRow initial />,
};

export const WithIconAndTrailing: Story = {
  render: () => <ControlledRow icon trailing />,
};

export const CheckedWithIconAndTrailing: Story = {
  render: () => <ControlledRow initial icon trailing />,
};

export const Disabled: Story = {
  render: () => <ControlledRow icon trailing disabled />,
};

export const List: Story = {
  name: 'Multiple rows (list context)',
  render: () => {
    const items = ['Bananas', 'Milk', 'Eggs', 'Coffee'];
    const [checkedSet, setCheckedSet] = useState<Set<string>>(new Set(['Milk']));
    return (
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item) => (
          <CheckableListRow
            key={item}
            checked={checkedSet.has(item)}
            onCheckedChange={(checked) =>
              setCheckedSet((prev) => {
                const next = new Set(prev);
                if (checked) next.add(item);
                else next.delete(item);
                return next;
              })
            }
            label={item}
          />
        ))}
      </div>
    );
  },
};
