import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Icon } from '../Icon/Icon';
import { MobileAppsDrawer, type MobileAppsDrawerItem } from './MobileAppsDrawer';

const ITEMS: MobileAppsDrawerItem[] = [
  {
    key: 'notes',
    icon: <Icon name="file" size="lg" aria-hidden />,
    label: 'Notes',
    href: '#notes',
  },
  {
    key: 'photos',
    icon: <Icon name="user" size="lg" aria-hidden />,
    label: 'Photos',
    href: '#photos',
  },
  {
    key: 'settings',
    icon: <Icon name="settings" size="lg" aria-hidden />,
    label: 'Settings',
    onClick: () => {},
  },
  {
    key: 'people',
    icon: <Icon name="user" size="lg" aria-hidden />,
    label: 'People',
    onClick: () => {},
  },
];

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open apps</Button>
      <MobileAppsDrawer
        open={open}
        onClose={() => setOpen(false)}
        aria-label="Apps"
        items={ITEMS}
      />
    </>
  );
}

const meta = {
  title: 'Components/MobileAppsDrawer',
  component: MobileAppsDrawer,
  parameters: {
    layout: 'centered',
    viewport: { defaultViewport: 'mobile' },
    docs: {
      description: {
        component:
          'The mobile launcher: a bottom sheet with a three-column grid of icon tiles, each a link or a button. The caller supplies the tiles. There is no header; the grab handle, a swipe down and a tap on the scrim dismiss it.',
      },
    },
  },
  args: { open: false, onClose: () => {}, 'aria-label': 'Apps', items: ITEMS },
} satisfies Meta<typeof MobileAppsDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <DrawerDemo /> };
