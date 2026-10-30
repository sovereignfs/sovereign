import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Calendar } from './Calendar';

function CalendarDemo({ minDate, maxDate }: { minDate?: Date; maxDate?: Date }) {
  const [value, setValue] = useState<Date | null>(new Date(2026, 9, 14));
  return (
    <Calendar
      value={value}
      onChange={setValue}
      aria-label="Choose a date"
      {...(minDate ? { minDate } : {})}
      {...(maxDate ? { maxDate } : {})}
    />
  );
}

const meta = {
  title: 'Components/Calendar',
  component: Calendar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A keyboard-navigable month grid for choosing one date. Arrow keys move by day and week, Home and End jump to the ends of the week, PageUp and PageDown change month, and Enter or Space selects.',
      },
    },
  },
  args: { value: null, onChange: () => {} },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <CalendarDemo /> };

export const WithLimits: Story = {
  render: () => <CalendarDemo minDate={new Date(2026, 9, 5)} maxDate={new Date(2026, 9, 25)} />,
};

export const NothingChosen: Story = {
  render: () => <Calendar value={null} onChange={() => {}} aria-label="Choose a date" />,
};
