import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppSidebar, type AppSidebarBlock } from './AppSidebar';
import { useAppSidebar } from './useAppSidebar';

const blocks: AppSidebarBlock[] = [
  {
    id: 'places',
    items: [
      { id: 'home', label: 'Home', icon: 'house', href: '#home', active: true },
      { id: 'inventory', label: 'Inventory', icon: 'package', href: '#inventory' },
      { id: 'cards', label: 'Loyalty cards', icon: 'wallet-cards', href: '#cards' },
    ],
  },
  {
    id: 'mine',
    heading: 'My lists',
    items: [
      {
        id: 'a',
        label: 'Groceries',
        icon: 'shopping-cart',
        iconColor: '#2563eb',
        count: 12,
        href: '#a',
      },
      { id: 'b', label: 'Hardware', icon: 'hammer', iconColor: '#d97706', count: 3, href: '#b' },
      { id: 'c', label: 'Birthday', icon: 'gift', iconColor: '#db2777', href: '#c' },
    ],
    action: { label: 'New list', onClick: () => undefined },
  },
  {
    id: 'shared',
    heading: 'Shared with me',
    items: [
      {
        id: 'd',
        label: 'Pharmacy',
        icon: 'pill',
        iconColor: '#059669',
        count: 1,
        description: 'Sam’s',
        href: '#d',
      },
      { id: 'e', label: 'Garden', href: '#e', description: 'Alex’s' },
    ],
  },
];

function Frame({ state }: { state: 'full' | 'rail' }) {
  return (
    <div style={{ display: 'flex', height: 520, border: '1px solid var(--sv-color-border)' }}>
      <AppSidebar
        blocks={blocks}
        state={state}
        aria-label="Shopper"
        onToggleRail={() => undefined}
      />
      <div style={{ flex: 1, padding: 24, color: 'var(--sv-color-text-muted)' }}>The page</div>
    </div>
  );
}

/** Kept on the device, per app and per kind of page: the rail button and a hide button, remembered across reloads. */
function Remembered() {
  const sidebar = useAppSidebar('storybook', 'page');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <button type="button" onClick={sidebar.toggleHidden} style={{ justifySelf: 'start' }}>
        {sidebar.state === 'hidden' ? 'Show the sidebar' : 'Hide the sidebar'}
      </button>
      <div style={{ display: 'flex', height: 480, border: '1px solid var(--sv-color-border)' }}>
        <AppSidebar
          blocks={blocks}
          state={sidebar.state}
          aria-label="Shopper"
          onToggleRail={sidebar.toggleRail}
        />
        <div style={{ flex: 1, padding: 24, color: 'var(--sv-color-text-muted)' }}>The page</div>
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/AppSidebar',
  component: Frame,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The sidebar every app has: full, a rail of icons (with tooltips) or hidden, kept on the device per app and per kind of page by `useAppSidebar`. Blocks of rows, each with an optional heading, rows with an icon in a colour and a count, and an optional trailing _+ New …_ row. Every word is the app’s.',
      },
    },
  },
} satisfies Meta<typeof Frame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = { args: { state: 'full' } };

export const Rail: Story = { args: { state: 'rail' } };

export const RememberedOnTheDevice: Story = {
  args: { state: 'full' },
  render: () => <Remembered />,
};
