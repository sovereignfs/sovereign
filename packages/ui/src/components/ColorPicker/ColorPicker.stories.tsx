import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorPicker } from './ColorPicker';

const meta = {
  title: 'Components/ColorPicker',
  component: ColorPicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A row of curated swatch suggestions plus a native `<input type="color">` trigger for picking any color, not just the curated set — every browser\'s own full-spectrum picker, guaranteed valid hex output, no bespoke a11y work.',
      },
    },
  },
  args: {
    swatches: [],
    value: null,
    onChange: () => {},
    onSelectionComplete: () => {},
    'aria-label': 'Color',
  },
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const SWATCHES = [
  { label: 'Sky', value: '#b5c9e8' },
  { label: 'Sage', value: '#c9e0c4' },
  { label: 'Sand', value: '#e8d3b5' },
  { label: 'Clay', value: '#e0c4c4' },
  { label: 'Lilac', value: '#d8c4e0' },
  { label: 'Ink', value: '#3b5166' },
  { label: 'Forest', value: '#3f5c4c' },
];

function ControlledColorPicker({
  initial = null,
  allowNone = false,
}: {
  initial?: string | null;
  allowNone?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <ColorPicker
      swatches={SWATCHES}
      value={value}
      onChange={setValue}
      allowNone={allowNone}
      aria-label="Board color"
    />
  );
}

export const Default: Story = {
  render: () => <ControlledColorPicker initial="#c9e0c4" />,
};

export const WithNoColorOption: Story = {
  render: () => <ControlledColorPicker allowNone />,
};

export const CustomColorSelected: Story = {
  render: () => <ControlledColorPicker initial="#7a3fd6" />,
};

export const Disabled: Story = {
  render: () => (
    <ColorPicker
      swatches={SWATCHES}
      value="#b5c9e8"
      onChange={() => {}}
      aria-label="Board color"
      disabled
    />
  ),
};
