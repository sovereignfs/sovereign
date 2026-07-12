import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuantityStepper } from './QuantityStepper';

const meta = {
  title: 'Components/QuantityStepper',
  component: QuantityStepper,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A numeric input with +/- buttons and an optional read-only unit suffix. Supports fractional step values for quantities like "1.5 kg".',
      },
    },
  },
  args: {
    value: 1,
    onChange: () => {},
    'aria-label': 'Quantity',
  },
} satisfies Meta<typeof QuantityStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledStepper({
  initial = 1,
  step = 1,
  min = 0,
  max,
  unit,
}: {
  initial?: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <QuantityStepper
      value={value}
      onChange={setValue}
      step={step}
      min={min}
      max={max}
      unit={unit}
      aria-label="Quantity"
    />
  );
}

export const Default: Story = {
  render: () => <ControlledStepper initial={1} />,
};

export const WithUnit: Story = {
  render: () => <ControlledStepper initial={6} unit="pcs" />,
};

export const FractionalStep: Story = {
  name: 'Fractional step (0.5 kg)',
  render: () => <ControlledStepper initial={1.5} step={0.5} unit="kg" />,
};

export const AtMinimum: Story = {
  render: () => <ControlledStepper initial={0} min={0} unit="pcs" />,
};

export const WithMax: Story = {
  render: () => <ControlledStepper initial={9} max={10} unit="pcs" />,
};

export const Disabled: Story = {
  render: () => (
    <QuantityStepper value={3} onChange={() => {}} unit="pcs" aria-label="Quantity" disabled />
  ),
};
