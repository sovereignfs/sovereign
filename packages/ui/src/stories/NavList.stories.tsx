import type { Meta, StoryObj } from '@storybook/react-vite';
import { NavList } from '../components/NavList/NavList';

const overviewGroup = {
  id: 'overview',
  items: [
    { id: 'overview', label: 'Overview', href: '#overview', icon: 'layout-dashboard' as const },
  ],
};

const peopleGroup = {
  id: 'people',
  label: 'People',
  items: [
    { id: 'users', label: 'Users', href: '#users', icon: 'users' as const },
    { id: 'groups', label: 'Groups', href: '#groups', icon: 'layers' as const },
  ],
};

const appsGroup = {
  id: 'apps',
  label: 'Apps',
  items: [
    { id: 'plugins', label: 'Apps', href: '#plugins', icon: 'layout-grid' as const },
    { id: 'entitlements', label: 'Entitlements', href: '#entitlements', icon: 'shield' as const },
  ],
};

const meta = {
  title: 'Components/NavList',
  component: NavList,
  parameters: { layout: 'padded' },
  args: {
    groups: [overviewGroup, peopleGroup, appsGroup],
    variant: 'static',
    'aria-label': 'Example sections',
  },
} satisfies Meta<typeof NavList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop sidebar shape — active row highlighted, no chevron. */
export const StaticActiveItem: Story = {
  args: {
    groups: [
      {
        id: 'overview',
        items: [
          {
            id: 'overview',
            label: 'Overview',
            href: '#overview',
            icon: 'layout-dashboard',
            active: true,
          },
        ],
      },
      peopleGroup,
      appsGroup,
    ],
  },
};

/**
 * `density="compact"` — shrinks row height/padding for a short, always-
 * visible `static` list (e.g. Warden's sidebar "New chat"/"Providers"/
 * "Models" rows above its longer session list), where the default's full
 * touch-target height reads as needlessly spaced out. Only meaningful with
 * `variant="static"`; every other story on this page stays at the default
 * density, unaffected.
 */
export const CompactDensity: Story = {
  args: {
    density: 'compact',
    groups: [
      {
        id: 'primary',
        items: [
          { id: 'new', label: 'New chat', href: '#new', icon: 'plus' },
          { id: 'providers', label: 'Providers', href: '#providers', icon: 'link' },
          { id: 'models', label: 'Models', href: '#models', icon: 'layers' },
        ],
      },
    ],
  },
};

/** Mobile index shape — every row gets a trailing chevron, no active state; tapping navigates to a full-screen section. */
export const Drilldown: Story = {
  args: { variant: 'drilldown' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

/** `group.label` omitted entirely renders a flat list with no section headers. */
export const Ungrouped: Story = {
  args: {
    groups: [
      {
        id: 'flat',
        items: [
          { id: 'a', label: 'First', href: '#a', icon: 'house' },
          { id: 'b', label: 'Second', href: '#b', icon: 'settings' },
        ],
      },
    ],
  },
};

/** Simulates a consumer swapping in a client-side router link (e.g. Next's `<Link>`) instead of a plain `<a>`. */
export const WithCustomLinkRenderer: Story = {
  args: {
    groups: [
      {
        id: 'overview',
        items: [
          {
            id: 'overview',
            label: 'Overview',
            href: '#overview',
            icon: 'layout-dashboard',
            active: true,
          },
        ],
      },
      peopleGroup,
    ],
    renderLink: (item, linkProps) => (
      <button
        type="button"
        className={linkProps.className}
        aria-current={linkProps['aria-current']}
        onClick={() => console.log(`client-side navigate to ${item.href}`)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
          width: '100%',
        }}
      >
        {linkProps.children}
      </button>
    ),
  },
};
