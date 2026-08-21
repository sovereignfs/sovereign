import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Menu, type MenuEntry } from './Menu';

const basicItems: MenuEntry[] = [
  { label: 'Rename', icon: 'pencil', onSelect: () => {} },
  { label: 'Duplicate', icon: 'package', onSelect: () => {} },
  { type: 'separator' },
  { label: 'Delete', icon: 'trash-2', destructive: true, onSelect: () => {} },
];

const groupedItems: MenuEntry[] = [
  { type: 'label', label: 'Sort by' },
  { label: 'Name', checked: true, onSelect: () => {} },
  { label: 'Date created', checked: false, onSelect: () => {} },
  { label: 'Date modified', checked: false, onSelect: () => {} },
  { type: 'separator' },
  { label: 'Delete list', icon: 'trash-2', destructive: true, onSelect: () => {} },
];

function MenuDemo({
  items = basicItems,
  label = 'Open menu',
}: {
  items?: MenuEntry[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      trigger={<Button onClick={() => setOpen((o) => !o)}>{label}</Button>}
      open={open}
      onClose={() => setOpen(false)}
      items={items}
      aria-label={label}
    />
  );
}

const meta = {
  title: 'Components/Menu',
  component: Menu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Adaptive action menu: `Popover` on desktop, a bottom-sheet `Drawer` on mobile. `items` accepts plain actions, section labels, separators, and mutually-exclusive `checked` entries (rendered as `menuitemradio`).',
      },
    },
  },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    trigger: <Button>Open menu</Button>,
    open: false,
    onClose: () => {},
    items: basicItems,
    'aria-label': 'Row actions',
  },
  render: () => <MenuDemo />,
};

export const WithLabelsAndCheckedItems: Story = {
  args: {
    trigger: <Button>Sort options</Button>,
    open: false,
    onClose: () => {},
    items: groupedItems,
    'aria-label': 'Sort options',
  },
  render: () => <MenuDemo items={groupedItems} label="Sort options" />,
};

export const AlignedRight: Story = {
  args: {
    trigger: <Button>Open menu</Button>,
    open: false,
    onClose: () => {},
    items: basicItems,
    'aria-label': 'Row actions',
    align: 'right',
  },
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <Menu
          trigger={<Button onClick={() => setOpen((o) => !o)}>Open menu (right-aligned)</Button>}
          open={open}
          onClose={() => setOpen(false)}
          items={basicItems}
          aria-label="Row actions"
          align="right"
        />
      );
    }
    return <Demo />;
  },
};

/** Play function opens the menu and asserts its items are visible. */
export const OpenViaInteraction: Story = {
  args: {
    trigger: <Button>Open menu</Button>,
    open: false,
    onClose: () => {},
    items: basicItems,
    'aria-label': 'Row actions',
  },
  render: () => <MenuDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open menu/i }));
    const menu = canvas.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(canvas.getByRole('menuitem', { name: /delete/i })).toBeVisible();
  },
};
