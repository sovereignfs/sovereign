import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slider } from './Slider';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Single-thumb range input. A native <input type="range"> under custom styling — arrow keys, Home/End, and touch-drag all come from the browser.',
      },
    },
  },
  args: {
    value: 50,
    onChange: () => {},
    min: 0,
    max: 100,
    'aria-label': 'Value',
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Slider {...args} value={value} onChange={setValue} />;
  },
};

export const WithLabel: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Slider {...args} label="Volume" value={value} onChange={setValue} />;
  },
};

export const AtMin: Story = {
  args: { value: 0 },
};

export const AtMax: Story = {
  args: { value: 100 },
};

export const SteppedRange: Story = {
  render: (_args) => {
    const [value, setValue] = useState(5);
    return (
      <Slider value={value} onChange={setValue} min={0} max={10} step={1} label="Rating (0–10)" />
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
