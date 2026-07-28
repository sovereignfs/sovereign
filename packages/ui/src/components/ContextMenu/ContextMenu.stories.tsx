import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContextMenu } from './ContextMenu';

const meta = {
  title: 'Components/ContextMenu',
  component: ContextMenu,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "Right-click menu on desktop, long-press on touch. Desktop positioning reuses Popover's existing collision detection anchored to the click point; touch opens the same items in a Drawer bottom sheet — a floating panel at a touch point isn't a pattern touch interfaces have.",
      },
    },
  },
  args: {
    children: <span />,
    items: [
      { label: 'Rename', onSelect: () => {} },
      { label: 'Duplicate', onSelect: () => {} },
      { type: 'separator' },
      { label: 'Delete', destructive: true, onSelect: () => {} },
    ],
    'aria-label': 'Row actions',
  },
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: (args) => (
    <ContextMenu {...args}>
      <div
        style={{
          width: 240,
          padding: 'var(--sv-space-4)',
          border: '1px dashed var(--sv-color-border-strong)',
          borderRadius: 'var(--sv-radius-md)',
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--sv-color-text-muted)',
        }}
      >
        Right-click here (or long-press on touch)
      </div>
    </ContextMenu>
  ),
};

export const WithIconsAndChecked: Story = {
  args: {
    items: [
      { type: 'label', label: 'Sort by' },
      { label: 'Name', checked: true, onSelect: () => {} },
      { label: 'Date modified', checked: false, onSelect: () => {} },
      { type: 'separator' },
      { label: 'Rename', icon: 'pencil', onSelect: () => {} },
      { label: 'Delete', icon: 'trash-2', destructive: true, onSelect: () => {} },
    ],
  },
  render: (args) => (
    <ContextMenu {...args}>
      <div
        style={{
          width: 240,
          padding: 'var(--sv-space-4)',
          border: '1px dashed var(--sv-color-border-strong)',
          borderRadius: 'var(--sv-radius-md)',
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--sv-color-text-muted)',
        }}
      >
        Right-click here
      </div>
    </ContextMenu>
  ),
};
