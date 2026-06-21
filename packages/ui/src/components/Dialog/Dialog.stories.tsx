import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from '@storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Dialog } from './Dialog';

// Controlled wrapper so the play function can open/inspect the dialog.
function DialogDemo({
  size = 'lg',
  label = 'Example dialog',
}: {
  size?: 'sm' | 'md' | 'lg' | 'full';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open {size} dialog</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size={size} aria-label={label}>
        <div style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--sv-color-text-primary)',
              marginBottom: 12,
            }}
          >
            {label}
          </h2>
          <p style={{ color: 'var(--sv-color-text-muted)', marginBottom: 24 }}>
            This is a <strong>{size}</strong> dialog. Press Esc or click the scrim to dismiss.
          </p>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Dialog>
    </>
  );
}

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Modal surface (scrim + panel). Router-agnostic — caller provides `onClose`. Supports Esc, scrim-click, focus trap and focus restoration. Sizes: `sm` / `md` / `lg` / `full`. Mobile always renders as a full-screen sheet.',
      },
    },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Small: Story = {
  render: () => <DialogDemo size="sm" label="Small dialog" />,
};

export const Medium: Story = {
  render: () => <DialogDemo size="md" label="Medium dialog" />,
};

export const Large: Story = {
  render: () => <DialogDemo size="lg" label="Large dialog" />,
};

export const Closed: Story = {
  render: () => (
    <Dialog open={false} onClose={() => {}} aria-label="Closed dialog">
      <p>Never seen</p>
    </Dialog>
  ),
};

/** Play function opens the dialog and asserts it is visible. */
export const OpenViaInteraction: Story = {
  render: () => <DialogDemo size="md" label="Interaction test dialog" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /open md dialog/i });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole('dialog');
    await expect(dialog).toBeVisible();
  },
};
