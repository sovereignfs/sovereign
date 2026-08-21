import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Sheet } from './Sheet';

function SheetDemo({
  title = 'Edit task',
  slideFrom = 'bottom' as 'bottom' | 'top',
}: {
  title?: string;
  slideFrom?: 'bottom' | 'top';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} slideFrom={slideFrom}>
        <div style={{ padding: 24, fontFamily: 'system-ui' }}>
          <p style={{ color: 'var(--sv-color-text-muted)' }}>
            Sheet content — replaces the plugin content area between the shell’s fixed header and
            footer.
          </p>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Sheet>
    </>
  );
}

const meta = {
  title: 'Components/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A full-page overlay that replaces a plugin’s content area, sliding in from an edge instead of centering like `Dialog`. No scrim — a Sheet visually replaces the region it covers rather than floating above it. Use the viewport addon at a mobile width for the intended context.',
      },
    },
    viewport: { defaultViewport: 'mobile' },
  },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: () => <SheetDemo />,
};

export const SlideFromTop: Story = {
  args: { open: false, onClose: () => {}, children: null, slideFrom: 'top' },
  render: () => <SheetDemo title="Filter options" slideFrom="top" />,
};

export const NoHeader: Story = {
  args: {
    open: true,
    onClose: () => {},
    'aria-label': 'Custom content',
    children: (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p style={{ color: 'var(--sv-color-text-muted)' }}>
          Content supplies its own header when `title` is omitted.
        </p>
      </div>
    ),
  },
};

/** Play function opens the sheet and asserts it is visible. */
export const OpenViaInteraction: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: () => <SheetDemo title="Edit task" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open sheet/i }));
    const sheet = canvas.getByRole('dialog');
    await expect(sheet).toBeVisible();
  },
};
