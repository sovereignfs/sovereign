import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Dialog, useOverlaySecondRow } from './Dialog';

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
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="sm" label="Small dialog" />,
};

export const Medium: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="md" label="Medium dialog" />,
};

export const Large: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="lg" label="Large dialog" />,
};

export const Closed: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => (
    <Dialog open={false} onClose={() => {}} aria-label="Closed dialog">
      <p>Never seen</p>
    </Dialog>
  ),
};

/** Play function opens the dialog and asserts it is visible. */
export const OpenViaInteraction: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="md" label="Interaction test dialog" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /open md dialog/i });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole('dialog');
    await expect(dialog).toBeVisible();
  },
};

// A stand-in for a plugin's own route layout — several component layers below
// wherever <Dialog> itself is instantiated, exactly like the real
// AccountLayout/ConsoleLayout usage this hook was built for.
function NestedTabStrip() {
  const insideOverlay = useOverlaySecondRow(
    <div style={{ display: 'flex', gap: 16, padding: '0 16px' }}>
      {['Profile', 'Security', 'Preferences'].map((tab) => (
        <span key={tab} style={{ fontSize: 14, color: 'var(--sv-color-text-primary)' }}>
          {tab}
        </span>
      ))}
    </div>,
  );
  return (
    <p style={{ color: 'var(--sv-color-text-muted)', fontSize: 13 }}>
      useOverlaySecondRow found a Dialog ancestor: <strong>{String(insideOverlay)}</strong>. Switch
      the viewport toolbar to a mobile width to see the tab strip render inside the Dialog's own
      mobile OverlayHeader instead of here.
    </p>
  );
}

/**
 * Demonstrates useOverlaySecondRow — solves the "double header" problem for
 * overlay-shell plugins (Console, Account): a deeply-nested layout hands its
 * tab strip up to the enclosing Dialog's mobile OverlayHeader instead of
 * rendering a second header bar as ordinary content. Only visible at mobile
 * widths, where Dialog's own OverlayHeader takes over; at desktop widths the
 * secondRow prop has no visible effect (OverlayHeader is desktop-hidden).
 */
export const WithOverlaySecondRow: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open dialog with tab strip</Button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Account" aria-label="Account">
            <div style={{ padding: 24, fontFamily: 'system-ui' }}>
              <NestedTabStrip />
            </div>
          </Dialog>
        </>
      );
    }
    return <Demo />;
  },
};
