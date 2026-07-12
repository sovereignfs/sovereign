import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconPicker } from './IconPicker';
import type { IconName } from '../Icon/Icon';

const meta = {
  title: 'Components/IconPicker',
  component: IconPicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A trigger button showing the current icon that opens a Popover grid of selectable icons — for a curated, bounded icon set rather than the full design-system library.',
      },
    },
  },
  args: {
    value: null,
    onChange: () => {},
    options: [],
    'aria-label': 'Icon',
  },
} satisfies Meta<typeof IconPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const GROCERY_ICONS: IconName[] = [
  'banana',
  'apple',
  'carrot',
  'egg',
  'milk',
  'beef',
  'drumstick',
  'fish',
  'croissant',
  'cookie',
  'pizza',
  'salad',
  'coffee',
  'wine',
  'beer',
  'cup-soda',
  'candy',
  'spray-can',
  'snowflake',
  'shopping-basket',
];

function ControlledIconPicker({ initial = null }: { initial?: IconName | null }) {
  const [value, setValue] = useState<IconName | null>(initial);
  return (
    <IconPicker
      value={value}
      onChange={setValue}
      options={GROCERY_ICONS}
      aria-label="Item icon"
      triggerLabel={value ?? 'Choose icon'}
    />
  );
}

export const Default: Story = {
  render: () => <ControlledIconPicker />,
};

export const Preselected: Story = {
  render: () => <ControlledIconPicker initial="banana" />,
};

export const Disabled: Story = {
  render: () => (
    <IconPicker
      value="milk"
      onChange={() => {}}
      options={GROCERY_ICONS}
      aria-label="Item icon"
      triggerLabel="Milk"
      disabled
    />
  ),
};
