import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Menu, type MenuEntry } from './Menu';

const ENTRIES: MenuEntry[] = [
  { type: 'label', label: 'Sort by' },
  { label: 'Name', checked: true, onSelect: () => {} },
  { label: 'Date added', checked: false, onSelect: () => {} },
  { type: 'separator' },
  { label: 'Rename', icon: 'pencil', onSelect: () => {} },
  { label: 'Open the guide', href: '#guide' },
  { label: 'Not available', disabled: true, onSelect: () => {} },
  { type: 'separator' },
  { label: 'Delete list', icon: 'trash-2', destructive: true, onSelect: () => {} },
];

function MenuDemo({ align = 'left' as 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      aria-label="List options"
      align={align}
      items={ENTRIES}
      trigger={
        <Button
          variant="secondary"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Options
        </Button>
      }
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
          'An action menu: a popover on a wide screen and a bottom sheet on a narrow one, with the same entries in both. Entries are actions, links, one of a set (`checked`), section labels and separators. Choosing one closes the menu and then calls its `onSelect`.',
      },
    },
  },
  args: {
    open: false,
    onClose: () => {},
    items: ENTRIES,
    'aria-label': 'List options',
    trigger: <Button>Options</Button>,
  },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <MenuDemo /> };
export const AlignedRight: Story = { render: () => <MenuDemo align="right" /> };
