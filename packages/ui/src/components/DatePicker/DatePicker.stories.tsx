import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { DatePicker } from './DatePicker';

function DatePickerDemo() {
  const [value, setValue] = useState<Date | null>(null);
  return <DatePicker value={value} onChange={setValue} aria-label="Due date" />;
}

const meta = {
  title: 'Components/DatePicker',
  component: DatePicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A form-field date picker pairing a compact trigger with `Calendar`: `Popover` on desktop, a bottom-sheet `Drawer` on mobile — the platform’s standard adaptive-surface pattern, matching `Menu`. Use the viewport addon at a mobile width to see the Drawer presentation.',
      },
    },
  },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { value: null, onChange: () => {}, 'aria-label': 'Due date' },
  render: () => <DatePickerDemo />,
};

export const WithValue: Story = {
  args: { value: new Date(), onChange: () => {}, 'aria-label': 'Due date' },
};

export const Disabled: Story = {
  args: { value: null, onChange: () => {}, 'aria-label': 'Due date', disabled: true },
};

export const CustomPlaceholder: Story = {
  args: {
    value: null,
    onChange: () => {},
    'aria-label': 'Delivery date',
    placeholder: 'Choose delivery date',
  },
};

/** Play function opens the picker and asserts the calendar grid is visible. */
export const OpenViaInteraction: Story = {
  args: { value: null, onChange: () => {}, 'aria-label': 'Due date' },
  render: () => <DatePickerDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /due date/i }));
    const grid = canvas.getByRole('grid');
    await expect(grid).toBeVisible();
  },
};
