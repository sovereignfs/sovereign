import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import { Drawer } from './Drawer';

function DrawerDemo({ label = 'Navigation' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open drawer</Button>
      <Drawer open={open} onClose={() => setOpen(false)} aria-label={label}>
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
          {(['house', 'grid-2x2', 'settings', 'user'] as const).map((icon) => (
            <li key={icon}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 15,
                  color: 'var(--sv-color-text-primary)',
                  fontFamily: 'system-ui',
                }}
              >
                <Icon name={icon} size="md" aria-hidden />
                {icon.replace(/-/g, ' ')}
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}

const meta = {
  title: 'Components/Drawer',
  component: Drawer,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Dismissable bottom-sheet panel. Used by the mobile shell for plugin navigation. Supports Esc, scrim-click, focus trap. Respects `env(safe-area-inset-bottom)`. Use the viewport addon at 375px to see the intended mobile context.',
      },
    },
    viewport: { defaultViewport: 'mobile' },
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DrawerDemo />,
};

export const Closed: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => (
    <Drawer open={false} onClose={() => {}} aria-label="Closed drawer">
      <p>Never seen</p>
    </Drawer>
  ),
};

function DrawerWithTitleDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open drawer</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Apps">
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
          {(['house', 'grid-2x2', 'settings', 'user'] as const).map((icon) => (
            <li key={icon}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 15,
                  color: 'var(--sv-color-text-primary)',
                  fontFamily: 'system-ui',
                }}
              >
                <Icon name={icon} size="md" aria-hidden />
                {icon.replace(/-/g, ' ')}
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}

/** Opt-in `title` prop renders a built-in `OverlayHeader` (title + close)
 * below the grab handle — hidden by default (see the `Default` story), for
 * consumers that want one instead of building their own header markup. */
export const WithTitle: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DrawerWithTitleDemo />,
};

function NestedDrawerDemo() {
  const [formOpen, setFormOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setFormOpen(true)}>Add expense</Button>
      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add expense">
        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
          <input aria-label="Amount" placeholder="0.00" style={{ padding: 8, font: 'inherit' }} />
          <Button variant="secondary" onClick={() => setPickerOpen(true)}>
            Pick a date
          </Button>
          <Drawer open={pickerOpen} onClose={() => setPickerOpen(false)} title="Date">
            <div style={{ padding: 16, minHeight: 180 }}>A calendar would go here.</div>
          </Drawer>
        </div>
      </Drawer>
    </>
  );
}

/** A Drawer opened from inside another Drawer — the shape `DatePicker`
 * produces on mobile, and the regression this component's portal exists for.
 * The inner drawer must cover the whole viewport and dim the outer one, not
 * render inside it clipped to its panel. */
export const NestedInsideAnotherDrawer: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <NestedDrawerDemo />,
};

/** Play function opens the drawer and asserts its list items are visible. */
export const OpenViaInteraction: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DrawerDemo label="Navigation menu" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open drawer/i }));
    // Queried from the document, not the story canvas: Drawer portals into
    // the shell root (or document.body, as here) rather than rendering where
    // it sits in the tree — see `useOverlayPortalTarget`.
    const drawer = within(document.body).getByRole('dialog', { name: 'Navigation menu' });
    await expect(drawer).toBeVisible();
  },
};
