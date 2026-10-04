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
          "Decimal amount entry that reports its value as an integer number of the currency's smallest units, matching the \"amounts are always smallest-unit integers\" data-model convention. `decimals` says how many of those make one major unit (default 2 — cents); pass the currency's own ISO exponent for a currency that isn't hundredths. Preserves in-progress typing (e.g. a trailing decimal point) instead of reformatting on every keystroke.",
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

function ControlledCurrencyInput({
  initialCents,
  decimals,
  placeholder = '0.00',
}: {
  initialCents: number | null;
  decimals?: number;
  placeholder?: string;
}) {
  const [cents, setCents] = useState<number | null>(initialCents);
  return (
    <CurrencyInput
      valueCents={cents}
      onValueChange={setCents}
      decimals={decimals}
      placeholder={placeholder}
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

/** Eight fraction digits, the exponent a satoshi-accurate BTC amount needs —
 *  `valueCents` is then a count of satoshis. At the default 2 the smallest
 *  expressible amount would be 0.01 BTC. */
export const EightDecimals: Story = {
  render: () => (
    <ControlledCurrencyInput initialCents={150_000_000} decimals={8} placeholder="0.00000000" />
  ),
};

/** Zero fraction digits — ISO 4217's exponent for JPY and KRW, where the
 *  major unit *is* the smallest unit. */
export const ZeroDecimals: Story = {
  render: () => <ControlledCurrencyInput initialCents={1500} decimals={0} placeholder="0" />,
};
