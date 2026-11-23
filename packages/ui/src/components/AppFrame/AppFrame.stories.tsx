import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon } from '../Icon/Icon';
import type { AppSidebarBlock } from '../AppSidebar/AppSidebar';
import { AppFrame } from './AppFrame';

const blocks: AppSidebarBlock[] = [
  {
    id: 'places',
    items: [
      { id: 'home', label: 'Home', icon: 'house', href: '#', active: true },
      { id: 'cards', label: 'Loyalty cards', icon: 'wallet-cards', href: '#' },
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
        href: '#',
      },
      { id: 'b', label: 'Hardware', icon: 'hammer', iconColor: '#d97706', count: 3, href: '#' },
    ],
    action: { label: 'New list', onClick: () => undefined },
  },
];

const brand = (
  <a
    href="/"
    style={{
      color: 'var(--sv-color-text-primary)',
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: '-0.05em',
      textDecoration: 'none',
    }}
  >
    app.
  </a>
);

function Demo({ detail = false }: { detail?: boolean }) {
  return (
    <AppFrame
      appId="storybook-frame"
      name="Example app"
      brand={brand}
      pageKind="page"
      blocks={blocks}
      avatarMenu={
        <span
          style={{
            display: 'inline-flex',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--sv-color-surface-sunken)',
          }}
        />
      }
      footer={{
        leftIcons: [
          { icon: <Icon name="house" size="md" aria-hidden />, label: 'Home', href: '#' },
        ],
        rightIcons: [
          { icon: <Icon name="wallet-cards" size="md" aria-hidden />, label: 'Cards', href: '#' },
        ],
        launcherLabel: 'Lists',
        launcherIcon: <Icon name="list" size="md" aria-hidden />,
      }}
      detail={detail ? <div style={{ padding: 24 }}>An item, in the right column</div> : undefined}
    >
      <div style={{ padding: 24, color: 'var(--sv-color-text-primary)' }}>The page’s content</div>
    </AppFrame>
  );
}

const meta = {
  title: 'Components/AppFrame',
  component: Demo,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The frame of an app’s signed-in page: Header, AppSidebar, the content and an optional right column on a wide screen; MobileHeader, the content, MobileFooter and a Drawer with the same blocks on a phone. Only what is drawn differs by the screen.',
      },
    },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithRightColumn: Story = { args: { detail: true } };

export const Phone: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } } };
