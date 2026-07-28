import type { Meta, StoryObj } from '@storybook/react-vite';
import { NavigationMenu } from './NavigationMenu';

const meta = {
  title: 'Components/NavigationMenu',
  component: NavigationMenu,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Top-level nav bar where some items open a flyout panel. Desktop-oriented by design — a hover-triggered flyout bar has no mobile equivalent. Once one flyout is open, hovering a sibling switches directly to it; ArrowLeft/ArrowRight move focus between triggers.',
      },
    },
  },
  args: { 'aria-label': 'Main' },
} satisfies Meta<typeof NavigationMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

const FlyoutContent = ({ links }: { links: string[] }) => (
  <div style={{ padding: 'var(--sv-space-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
    {links.map((link) => (
      <a
        key={link}
        href={`/${link.toLowerCase().replace(/\s+/g, '-')}`}
        style={{
          fontSize: 14,
          color: 'var(--sv-color-text-primary)',
          textDecoration: 'none',
          padding: 'var(--sv-space-1) var(--sv-space-2)',
        }}
      >
        {link}
      </a>
    ))}
  </div>
);

export const Default: Story = {
  args: {
    items: [
      { label: 'Home', href: '/home' },
      {
        label: 'Products',
        content: <FlyoutContent links={['Tasks', 'Ledger', 'Shopper', 'Wallet']} />,
      },
      {
        label: 'Company',
        content: <FlyoutContent links={['About', 'Blog', 'Careers']} />,
      },
      { label: 'Docs', href: '/docs' },
    ],
  },
};
