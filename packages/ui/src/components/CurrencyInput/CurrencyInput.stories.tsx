import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CurrencyInput } from './CurrencyInput';

const meta = {
  title: 'Components/CurrencyInput',
  component: CurrencyInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Decimal amount entry that reports its value as integer cents, matching the "amounts are always smallest-unit integers" data-model convention. Preserves in-progress typing (e.g. a trailing decimal point) instead of reformatting on every keystroke.',
      },
    },
  },
  args: {
    valueCents: null,
    onValueChange: () => {},
  },
} satisfies Meta<typeof CurrencyInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledCurrencyInput({ initialCents }: { initialCents: number | null }) {
  const [cents, setCents] = useState<number | null>(initialCents);
  return (
    <CurrencyInput
      valueCents={cents}
      onValueChange={setCents}
      placeholder="0.00"
      aria-label="Amount"
    />
  );
}

export const Empty: Story = {
  render: () => <ControlledCurrencyInput initialCents={null} />,
};

export const Prefilled: Story = {
  render: () => <ControlledCurrencyInput initialCents={4250} />,
};

export const Disabled: Story = {
  render: () => (
    <CurrencyInput valueCents={1000} onValueChange={() => {}} aria-label="Amount" disabled />
  ),
};
