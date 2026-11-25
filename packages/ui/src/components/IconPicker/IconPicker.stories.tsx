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

/** A list's icon, beyond groceries (Shopper's RFC 0005): what a list, a category or a card is for. */
const LIST_ICONS: IconName[] = [
  'shopping-cart',
  'shopping-basket',
  'store',
  'hammer',
  'wrench',
  'plug',
  'laptop',
  'headphones',
  'shirt',
  'gift',
  'sprout',
  'flower-2',
  'briefcase',
  'paperclip',
  'pill',
  'baby',
  'dog',
  'sofa',
  'wallet-cards',
];

function ControlledIconPicker({
  initial = null,
  options = GROCERY_ICONS,
}: {
  initial?: IconName | null;
  options?: IconName[];
}) {
  const [value, setValue] = useState<IconName | null>(initial);
  return (
    <IconPicker
      value={value}
      onChange={setValue}
      options={options}
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

export const ListIcons: Story = {
  render: () => <ControlledIconPicker initial="shopping-cart" options={LIST_ICONS} />,
};

/**
 * A picker at the left of a page that scrolls beside a sidebar (Shopper's categories, with the icon before the name): there is
 * room to its left in the viewport but none in the scroller, which would cut a panel opened that way off. The panel opens
 * rightwards from the trigger, where it fits (`align`, `auto` by default).
 */
export const BesideASidebar: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div
      style={{
        display: 'flex',
        height: 320,
        fontFamily: 'var(--sv-font-family)',
        fontSize: 'var(--sv-font-size-sm)',
        color: 'var(--sv-color-text-muted)',
      }}
    >
      <nav
        aria-label="Sidebar"
        style={{ width: 240, padding: 16, borderRight: '1px solid var(--sv-color-border)' }}
      >
        Sidebar
      </nav>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
        <ControlledIconPicker initial="apple" />
      </div>
    </div>
  ),
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
