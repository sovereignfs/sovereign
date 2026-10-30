import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { ConfirmDialog } from './ConfirmDialog';

function ConfirmDemo({
  destructive = false,
  error,
  pending = false,
}: {
  destructive?: boolean;
  error?: string;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={destructive ? 'destructive' : 'primary'} onClick={() => setOpen(true)}>
        {destructive ? 'Remove' : 'Publish'}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title={destructive ? 'Remove this app?' : 'Publish this page?'}
        message={
          destructive ? (
            <>
              <strong>Notes</strong> stops signing people in, and what it was given is taken back.
            </>
          ) : (
            'Everyone who can see the site will see it.'
          )
        }
        confirmLabel={destructive ? 'Remove' : 'Publish'}
        destructive={destructive}
        pending={pending}
        error={error}
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
          'A small confirm-or-cancel prompt sized to its message, built on the native `<dialog>` so it stacks above any other overlay. It does not close itself: the caller closes it once the action settles.',
      },
    },
  },
  args: { open: false, onClose: () => {}, onConfirm: () => {}, title: '', message: '' },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <ConfirmDemo /> };
export const Destructive: Story = { render: () => <ConfirmDemo destructive /> };
export const WithError: Story = {
  render: () => <ConfirmDemo destructive error="That could not be done. Try again." />,
};
