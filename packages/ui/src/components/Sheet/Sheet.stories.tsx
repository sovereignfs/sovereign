import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Sheet } from './Sheet';

function SheetDemo({
  slideFrom = 'bottom' as 'bottom' | 'top',
  withBack = false,
}: {
  slideFrom?: 'bottom' | 'top';
  withBack?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="List details"
        slideFrom={slideFrom}
        {...(withBack ? { onBack: () => setOpen(false) } : {})}
        headerAction={<Button size="sm">Save</Button>}
      >
        <p style={{ padding: 16 }}>
          A sheet replaces the region it covers, so it has no scrim to tap. Esc closes it, and focus
          returns to the button that opened it.
        </p>
      </Sheet>
    </>
  );
}

const meta = {
  title: 'Components/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
    viewport: { defaultViewport: 'mobile' },
    docs: {
      description: {
        component:
          'A full-page overlay for a narrow screen that slides in from an edge and replaces the content area between the shell’s fixed header and footer. Focus moves into it on opening, is trapped, and returns on closing.',
      },
    },
  },
  args: { open: false, onClose: () => {}, children: null },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <SheetDemo /> };
export const FromTop: Story = { render: () => <SheetDemo slideFrom="top" /> };
export const WithBackButton: Story = { render: () => <SheetDemo withBack /> };
