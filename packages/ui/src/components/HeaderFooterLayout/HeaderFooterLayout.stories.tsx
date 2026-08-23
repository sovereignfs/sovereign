import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeaderFooterLayout } from './HeaderFooterLayout';

function Bar({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontFamily: 'var(--sv-font-family)',
        fontSize: 'var(--sv-font-size-sm)',
        fontWeight: 600,
        color: 'var(--sv-color-text-primary)',
        background: 'var(--sv-color-surface-raised)',
        borderBlock: '1px solid var(--sv-color-border)',
      }}
    >
      {label}
    </div>
  );
}

function ScrollableMain() {
  return (
    <div style={{ padding: 'var(--sv-space-4)', fontFamily: 'var(--sv-font-family)' }}>
      {Array.from({ length: 30 }, (_, index) => (
        <p key={index} style={{ color: 'var(--sv-color-text-primary)' }}>
          Row {index + 1} — the main region scrolls independently; header and footer stay put.
        </p>
      ))}
    </div>
  );
}

const meta = {
  title: 'Components/HeaderFooterLayout',
  component: HeaderFooterLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Header + main + optional footer, both fixed-height and independently optional, with main always claiming the remaining height. The vertical counterpart to ThreeColumnLayout — a plain flex column, no color opinions, no responsive behavior of its own.',
      },
    },
  },
  args: {
    children: <ScrollableMain />,
  },
} satisfies Meta<typeof HeaderFooterLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The canonical usage — header + main + footer, all three present. */
export const Default: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <HeaderFooterLayout header={<Bar label="Header" />} footer={<Bar label="Footer" />}>
        <ScrollableMain />
      </HeaderFooterLayout>
    </div>
  ),
};

export const HeaderOnly: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <HeaderFooterLayout header={<Bar label="Header" />}>
        <ScrollableMain />
      </HeaderFooterLayout>
    </div>
  ),
};

export const FooterOnly: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <HeaderFooterLayout footer={<Bar label="Footer" />}>
        <ScrollableMain />
      </HeaderFooterLayout>
    </div>
  ),
};

export const MainOnly: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <HeaderFooterLayout>
        <ScrollableMain />
      </HeaderFooterLayout>
    </div>
  ),
};

export const CustomHeights: Story = {
  render: () => (
    <div style={{ height: '480px' }}>
      <HeaderFooterLayout
        header={<Bar label="Header (100px)" />}
        footer={<Bar label="Footer (48px)" />}
        headerHeight={100}
        footerHeight={48}
      >
        <ScrollableMain />
      </HeaderFooterLayout>
    </div>
  ),
};
