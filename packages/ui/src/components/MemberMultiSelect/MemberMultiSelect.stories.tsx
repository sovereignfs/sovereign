import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CurrencyInput } from '../CurrencyInput/CurrencyInput';
import { MemberMultiSelect, type MemberMultiSelectOption } from './MemberMultiSelect';

const meta = {
  title: 'Components/MemberMultiSelect',
  component: MemberMultiSelect,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Checkbox list for picking any number of people from an already-resolved set of options. Domain-agnostic about who an option represents — instance users and guest members are both just `{id, label}`, so nothing special is needed to include guests. Not a directory search or invite flow; pair with SuggestionInput for that.',
      },
    },
  },
  args: {
    options: [],
    selectedIds: new Set(),
    onToggle: () => {},
  },
} satisfies Meta<typeof MemberMultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

const OPTIONS: MemberMultiSelectOption[] = [
  { id: '1', label: 'Priya' },
  { id: '2', label: 'Jamie (guest)' },
  { id: '3', label: 'Sam' },
];

function ControlledMultiSelect({ withTrailing = false }: { withTrailing?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['1', '3']));
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});

  return (
    <MemberMultiSelect
      options={OPTIONS}
      selectedIds={selected}
      onToggle={(id, checked) => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (checked) next.add(id);
          else next.delete(id);
          return next;
        });
      }}
      label="Split between"
      hint={withTrailing ? 'Remaining: 0.00' : undefined}
      renderTrailing={
        withTrailing
          ? (id) => (
              <CurrencyInput
                valueCents={amounts[id] ?? null}
                onValueChange={(cents) => setAmounts((prev) => ({ ...prev, [id]: cents }))}
                placeholder="0.00"
                aria-label={`Amount for ${OPTIONS.find((o) => o.id === id)?.label}`}
              />
            )
          : undefined
      }
    />
  );
}

export const Default: Story = {
  render: () => <ControlledMultiSelect />,
};

export const WithTrailingAmountInput: Story = {
  render: () => <ControlledMultiSelect withTrailing />,
};
