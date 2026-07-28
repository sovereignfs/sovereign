import type { Meta, StoryObj } from '@storybook/react-vite';
import { Menubar } from './Menubar';

const meta = {
  title: 'Components/Menubar',
  component: Menubar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "Desktop app-style menu bar (File/Edit/View...). A thin composition of NavigationMenu with MenuEntries as each item's flyout content — no positioning or list-rendering logic duplicated.",
      },
    },
  },
} satisfies Meta<typeof Menubar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    menus: [
      {
        label: 'File',
        items: [
          { label: 'New conversation', onSelect: () => {} },
          { label: 'Export', onSelect: () => {} },
          { type: 'separator' },
          { label: 'Close', onSelect: () => {} },
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo', onSelect: () => {} },
          { label: 'Redo', onSelect: () => {} },
        ],
      },
      {
        label: 'View',
        items: [
          { type: 'label', label: 'Layout' },
          { label: 'Compact', checked: false, onSelect: () => {} },
          { label: 'Comfortable', checked: true, onSelect: () => {} },
        ],
      },
    ],
  },
};
