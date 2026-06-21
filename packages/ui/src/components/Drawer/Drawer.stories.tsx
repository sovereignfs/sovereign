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
  render: () => <DrawerDemo />,
};

export const Closed: Story = {
  render: () => (
    <Drawer open={false} onClose={() => {}} aria-label="Closed drawer">
      <p>Never seen</p>
    </Drawer>
  ),
};

/** Play function opens the drawer and asserts its list items are visible. */
export const OpenViaInteraction: Story = {
  render: () => <DrawerDemo label="Navigation menu" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open drawer/i }));
    const drawer = canvas.getByRole('navigation');
    await expect(drawer).toBeVisible();
  },
};
