import type { Meta, StoryObj } from '@storybook/react-vite';
import { RootLayout } from './RootLayout';

function Block({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--sv-space-4)',
        fontFamily: 'var(--sv-font-family)',
        fontSize: 'var(--sv-font-size-sm)',
        fontWeight: 600,
        color: 'var(--sv-color-text-primary)',
        background: 'var(--sv-color-surface-raised)',
      }}
    >
      {label}
    </div>
  );
}

const meta = {
  title: 'Components/RootLayout',
  component: RootLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "The root-level layout a plugin's page tree sits in. Enforces only structure and dimensions — content always comes from children. Each variant is a fixed web+mobile pairing, not two independent axes; resize the viewport (or check the Mobile story) to see the fork. 'header' keeps the same header+main structure on both breakpoints, but headerHeight (48px, web) and mobileHeaderHeight (60px, mobile) are deliberately different — matching how real shell: minimal plugins do this in production.",
      },
    },
  },
  args: {
    children: <Block label="Main" />,
  },
} satisfies Meta<typeof RootLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** variant="plain" is the prop's own default — a single child, no chrome. */
export const Default: Story = {
  render: () => (
    <div style={{ height: '100vh' }}>
      <RootLayout variant="plain">
        <Block label="Main" />
      </RootLayout>
    </div>
  ),
};

export const Sidebar: Story = {
  render: () => (
    <div style={{ height: '100vh' }}>
      <RootLayout variant="sidebar">
        <Block label="Sidebar" />
        <Block label="Main" />
      </RootLayout>
    </div>
  ),
};

export const SidebarMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <div style={{ height: '100vh' }}>
      <RootLayout variant="sidebar">
        <Block label="Sidebar (hidden on mobile)" />
        <Block label="Main" />
      </RootLayout>
    </div>
  ),
};

export const Header: Story = {
  render: () => (
    <div style={{ height: '100vh' }}>
      <RootLayout variant="header">
        <Block label="Header (48px)" />
        <Block label="Main" />
      </RootLayout>
    </div>
  ),
};

export const HeaderMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <div style={{ height: '100vh' }}>
      <RootLayout variant="header">
        <Block label="Header (60px)" />
        <Block label="Main" />
      </RootLayout>
    </div>
  ),
};

export const Shell: Story = {
  render: () => (
    <div style={{ height: '100vh' }}>
      <RootLayout variant="shell">
        <Block label="Header (mobile only)" />
        <Block label="Main" />
        <Block label="Footer (mobile only)" />
      </RootLayout>
    </div>
  ),
};

export const ShellMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <div style={{ height: '100vh' }}>
      <RootLayout variant="shell">
        <Block label="Header" />
        <Block label="Main" />
        <Block label="Footer" />
      </RootLayout>
    </div>
  ),
};
