import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Command } from './Command';
import { Button } from '../Button/Button';

const meta = {
  title: 'Components/Command',
  component: Command,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '⌘K-style command palette. Opened via Dialog, which supplies the modal shell — this adds the search input, substring filtering, and arrow-key/Enter selection on top of it. Controlled: the consumer owns the open state and any global shortcut listener that flips it.',
      },
    },
  },
  args: { open: false, onClose: () => {}, items: [] },
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

function CommandDemo() {
  const [open, setOpen] = useState(false);
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  return (
    <div>
      <Button onClick={() => setOpen(true)}>Open command palette</Button>
      {lastSelected && (
        <p
          style={{
            marginTop: 'var(--sv-space-3)',
            fontSize: 14,
            color: 'var(--sv-color-text-muted)',
          }}
        >
          Last selected: {lastSelected}
        </p>
      )}
      <Command
        open={open}
        onClose={() => setOpen(false)}
        aria-label="Command palette"
        items={[
          {
            id: 'new',
            label: 'New conversation',
            group: 'Actions',
            icon: 'plus',
            onSelect: () => setLastSelected('New conversation'),
          },
          {
            id: 'export',
            label: 'Export chat',
            group: 'Actions',
            icon: 'upload',
            keywords: 'download save',
            onSelect: () => setLastSelected('Export chat'),
          },
          {
            id: 'profile',
            label: 'Go to profile',
            group: 'Navigation',
            icon: 'user',
            onSelect: () => setLastSelected('Go to profile'),
          },
          {
            id: 'settings',
            label: 'Open settings',
            group: 'Navigation',
            icon: 'settings',
            onSelect: () => setLastSelected('Open settings'),
          },
        ]}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <CommandDemo />,
};

export const OpenWithNoResults: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(true);
      return (
        <Command
          open={open}
          onClose={() => setOpen(false)}
          aria-label="Command palette"
          placeholder="Try typing something with no matches…"
          items={[{ id: 'a', label: 'Alpha', onSelect: () => {} }]}
        />
      );
    }
    return <Demo />;
  },
};
