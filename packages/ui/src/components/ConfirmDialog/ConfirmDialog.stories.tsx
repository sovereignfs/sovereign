import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { ConfirmDialog } from './ConfirmDialog';

function ConfirmDialogDemo({
  destructive = false,
  title = 'Remove member?',
}: {
  destructive?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open confirm dialog</Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        message="This action can't be undone."
        onConfirm={() => setOpen(false)}
        destructive={destructive}
      />
    </>
  );
}

const meta = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A small, content-sized confirm/cancel prompt built on the native `<dialog>` element (not `Dialog`, which is a fixed-size box by design). Same presentation on desktop and mobile.',
      },
    },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    open: false,
    onClose: () => {},
    title: 'Remove member?',
    message: "This action can't be undone.",
    onConfirm: () => {},
  },
  render: () => <ConfirmDialogDemo />,
};

export const Destructive: Story = {
  args: {
    open: false,
    onClose: () => {},
    title: 'Delete list?',
    message: 'All tasks in this list will be permanently deleted.',
    onConfirm: () => {},
    destructive: true,
  },
  render: () => <ConfirmDialogDemo destructive title="Delete list?" />,
};

export const Pending: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Removing member…',
    message: 'This action can’t be undone.',
    onConfirm: () => {},
    pending: true,
    confirmLabel: 'Removing…',
  },
};

export const WithError: Story = {
  args: {
    open: true,
    onClose: () => {},
    title: 'Remove member?',
    message: "This action can't be undone.",
    onConfirm: () => {},
    error: 'Failed to remove member. Try again.',
  },
};

/** Play function opens the dialog and asserts it is visible. */
export const OpenViaInteraction: Story = {
  args: {
    open: false,
    onClose: () => {},
    title: 'Remove member?',
    message: "This action can't be undone.",
    onConfirm: () => {},
  },
  render: () => <ConfirmDialogDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open confirm dialog/i }));
    const dialog = canvas.getByRole('dialog', { hidden: true });
    await expect(dialog).toBeVisible();
  },
};
