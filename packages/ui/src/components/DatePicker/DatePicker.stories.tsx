import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DatePicker } from './DatePicker';

function DatePickerDemo({ disabled = false, withLimits = false }) {
  const [value, setValue] = useState<Date | null>(null);
  return (
    <DatePicker
      value={value}
      onChange={setValue}
      aria-label="Due date"
      placeholder="Pick a date"
      disabled={disabled}
      {...(withLimits ? { minDate: new Date(2026, 9, 5), maxDate: new Date(2026, 9, 25) } : {})}
    />
  );
}

const meta = {
  title: 'Components/DatePicker',
  component: DatePicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A form field with a built-in trigger that opens a `Calendar`: in a popover on a wide screen and a bottom sheet on a narrow one. Date only.',
      },
    },
  },
  args: { value: null, onChange: () => {}, 'aria-label': 'Due date' },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <DatePickerDemo /> };
export const WithLimits: Story = { render: () => <DatePickerDemo withLimits /> };
export const Disabled: Story = { render: () => <DatePickerDemo disabled /> };
