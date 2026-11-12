import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DateRangePicker, type DateRange } from './DateRangePicker';

function Demo({ withLimits = false, disabled = false }) {
  const [value, setValue] = useState<DateRange>({ start: null, end: null });
  return (
    <DateRangePicker
      value={value}
      onChange={setValue}
      aria-label="Arrival and departure"
      placeholder="Select dates"
      disabled={disabled}
      {...(withLimits ? { min: '2026-10-05', max: '2026-10-25' } : {})}
    />
  );
}

const meta = {
  title: 'Components/DateRangePicker',
  component: DateRangePicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Two dates in one field, such as a stop’s arrival and departure: `YYYY-MM-DD` in and out, the nights between said, the days outside `min` and `max` disabled. A popover on a wide screen and a bottom sheet on a narrow one.',
      },
    },
  },
} satisfies Meta<typeof DateRangePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  value: { start: null, end: null },
  onChange: () => {},
  'aria-label': 'Arrival and departure',
};
export const Empty: Story = { args: base, render: () => <Demo /> };
export const WithLimits: Story = { args: base, render: () => <Demo withLimits /> };
export const Disabled: Story = { args: base, render: () => <Demo disabled /> };
