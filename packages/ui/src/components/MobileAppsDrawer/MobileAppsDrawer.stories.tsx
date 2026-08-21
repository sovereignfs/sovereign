import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Icon, type IconName } from '../Icon/Icon';
import { MobileAppsDrawer, type MobileAppsDrawerItem } from './MobileAppsDrawer';

const iconNames: IconName[] = ['house', 'grid-2x2', 'settings', 'user', 'bell', 'package'];

const items: MobileAppsDrawerItem[] = iconNames.map((name) => ({
  key: name,
  icon: <Icon name={name} size="lg" aria-hidden />,
  label: name.replace(/-/g, ' '),
  onClick: () => {},
}));

function MobileAppsDrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open apps drawer</Button>
      <MobileAppsDrawer
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        aria-label="Apps"
      />
    </>
  );
}

const meta = {
  title: 'Components/MobileAppsDrawer',
  component: MobileAppsDrawer,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The mobile "Apps" drawer: a bottom sheet with a 3-column grid of icon tiles, same layout as the runtime shell’s own Apps drawer. No header row — Drawer’s own grab handle plus swipe-down/scrim-tap dismissal are enough. Use the viewport addon at 375px to see the intended mobile context.',
      },
    },
    viewport: { defaultViewport: 'mobile' },
  },
} satisfies Meta<typeof MobileAppsDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { open: false, onClose: () => {}, items, 'aria-label': 'Apps' },
  render: () => <MobileAppsDrawerDemo />,
};

export const WithLinkTiles: Story = {
  args: {
    open: true,
    onClose: () => {},
    items: items.map((item) => ({ ...item, href: '#', onClick: undefined })),
    'aria-label': 'Apps',
  },
};

/** Play function opens the drawer and asserts its tiles are visible. */
export const OpenViaInteraction: Story = {
  args: { open: false, onClose: () => {}, items, 'aria-label': 'Apps' },
  render: () => <MobileAppsDrawerDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /open apps drawer/i }));
    const nav = canvas.getByRole('navigation', { name: /apps/i });
    await expect(nav).toBeVisible();
  },
};
