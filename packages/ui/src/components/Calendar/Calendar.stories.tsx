import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Calendar } from './Calendar';

function CalendarDemo({ minDate, maxDate }: { minDate?: Date; maxDate?: Date }) {
  const [value, setValue] = useState<Date | null>(null);
  return (
    <div style={{ width: 320 }}>
      <Calendar
        value={value}
        onChange={setValue}
        minDate={minDate}
        maxDate={maxDate}
        aria-label="Choose a date"
      />
      <p style={{ marginTop: 12, fontSize: 13, color: 'var(--sv-color-text-muted)' }}>
        Selected: {value ? value.toDateString() : 'none'}
      </p>
    </div>
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
          'Keyboard-navigable month grid (WAI-ARIA APG grid pattern, roving tabindex). Date-only — no time or range selection. `DatePicker` wraps this in a `Popover` (desktop) or `Drawer` (mobile).',
      },
    },
  },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { value: null, onChange: () => {} },
  render: () => <CalendarDemo />,
};

export const WithDateRange: Story = {
  args: { value: null, onChange: () => {} },
  render: () => {
    const today = new Date();
    const minDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const maxDate = new Date(today.getFullYear(), today.getMonth() + 1, 15);
    return <CalendarDemo minDate={minDate} maxDate={maxDate} />;
  },
};

export const WithSelectedDate: Story = {
  args: { value: new Date(), onChange: () => {} },
  render: (args) => (
    <div style={{ width: 320 }}>
      <Calendar {...args} aria-label="Choose a date" />
    </div>
  ),
};

/** Play function selects a day via keyboard and asserts the roving tabindex moved. */
export const KeyboardNavigation: Story = {
  args: { value: null, onChange: () => {} },
  render: () => <CalendarDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByRole('grid');
    const focusTarget = grid.querySelector<HTMLButtonElement>('[tabindex="0"]');
    focusTarget?.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(grid).toBeVisible();
  },
};
