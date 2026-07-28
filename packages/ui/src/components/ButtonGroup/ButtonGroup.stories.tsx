import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ButtonGroup } from './ButtonGroup';
import { Button } from '../Button/Button';

const meta = {
  title: 'Components/ButtonGroup',
  component: ButtonGroup,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: () => (
    <ButtonGroup aria-label="View">
      <Button variant="secondary" size="sm">
        Day
      </Button>
      <Button variant="secondary" size="sm">
        Week
      </Button>
      <Button variant="secondary" size="sm">
        Month
      </Button>
    </ButtonGroup>
  ),
};

export const WithActiveSelection: Story = {
  render: () => {
    const [view, setView] = useState<'day' | 'week' | 'month'>('week');
    const options: { value: typeof view; label: string }[] = [
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'Week' },
      { value: 'month', label: 'Month' },
    ];
    return (
      <ButtonGroup aria-label="View">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={option.value === view ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
    );
  },
};
