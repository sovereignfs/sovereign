import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageLayout } from './PageLayout';

function Content() {
  return (
    <div
      style={{
        fontFamily: 'var(--sv-font-family)',
        fontSize: 'var(--sv-font-size-sm)',
        color: 'var(--sv-color-text-primary)',
      }}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <p key={index}>Page content row {index + 1}.</p>
      ))}
    </div>
  );
}

function PageHeader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--sv-space-3) var(--sv-space-4)',
        borderBottom: '1px solid var(--sv-color-border)',
        fontFamily: 'var(--sv-font-family)',
        fontSize: 'var(--sv-font-size-md)',
        fontWeight: 600,
        color: 'var(--sv-color-text-primary)',
      }}
    >
      Sv Wallet
    </div>
  );
}

const meta = {
  title: 'Components/PageLayout',
  component: PageLayout,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "A single page's content area, nested inside RootLayout's main slot — not a replacement for RootLayout. No padding by default; opt in via the padding prop (same scale as PageContainer). The optional header is page-specific (e.g. a board title/toolbar), not the app-level header RootLayout already renders.",
      },
    },
  },
  args: {
    children: <Content />,
  },
} satisfies Meta<typeof PageLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPadding: Story = {
  args: {
    padding: 'lg',
  },
};

export const WithHeader: Story = {
  args: {
    header: <PageHeader />,
    padding: 'md',
  },
};
