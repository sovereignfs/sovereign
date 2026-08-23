import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppsLauncher } from '../components/AppsLauncher/AppsLauncher';
import { Header } from '../components/Header/Header';
import { Icon } from '../components/Icon/Icon';
import { MobileFooter } from '../components/MobileFooter/MobileFooter';
import { MobileHeader } from '../components/MobileHeader/MobileHeader';
import { NotificationsPanel } from '../components/NotificationsPanel/NotificationsPanel';
import { OverlayHeader } from '../components/OverlayHeader/OverlayHeader';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { PageLayout } from '../components/PageLayout/PageLayout';
import { RootLayout } from '../components/RootLayout/RootLayout';
import { UserMenu } from '../components/UserMenu/UserMenu';

// ---------------------------------------------------------------------------
// Shared primitives (mirrors the conventions in Overview/Mobile Patterns)
// ---------------------------------------------------------------------------

const ff = 'var(--sv-font-family)';

function Heading({ level = 2, children }: { level?: 1 | 2 | 3; children: React.ReactNode }) {
  const sizes: Record<number, string> = { 1: '1.75rem', 2: '1.125rem', 3: '0.9375rem' };
  const weights: Record<number, number> = { 1: 700, 2: 600, 3: 600 };
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  return (
    <Tag
      style={{
        fontFamily: ff,
        fontSize: sizes[level],
        fontWeight: weights[level],
        color: 'var(--sv-color-text-primary)',
        margin: 0,
        lineHeight: 1.3,
      }}
    >
      {children}
    </Tag>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: ff,
        fontSize: 'var(--sv-font-size-sm)',
        color: 'var(--sv-color-text-muted)',
        margin: '0.5rem 0 0',
        lineHeight: 1.6,
      }}
    >
      {children}
    </p>
  );
}

function SectionHeader({
  title,
  subtitle,
  source,
}: {
  title: string;
  subtitle?: string;
  source: string;
}) {
  return (
    <div
      style={{
        paddingBottom: 'var(--sv-space-3)',
        borderBottom: '2px solid var(--sv-color-accent)',
        marginBottom: 'var(--sv-space-5)',
      }}
    >
      <Heading level={2}>{title}</Heading>
      {subtitle && <Body>{subtitle}</Body>}
      <p
        style={{
          fontFamily: 'var(--sv-font-family-mono)',
          fontSize: '0.75rem',
          color: 'var(--sv-color-text-muted)',
          margin: '0.5rem 0 0',
        }}
      >
        {source}
      </p>
    </div>
  );
}

function Callout({ type, children }: { type: 'warn' | 'tip'; children: React.ReactNode }) {
  const map = {
    warn: {
      bg: 'var(--sv-color-warning-surface)',
      border: 'var(--sv-color-warning-border)',
      text: 'var(--sv-color-warning-text)',
      label: '⚠',
    },
    tip: {
      bg: 'var(--sv-color-success-surface)',
      border: 'var(--sv-color-success-border)',
      text: 'var(--sv-color-success-text)',
      label: '✓',
    },
  };
  const c = map[type];
  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 'var(--sv-radius-md)',
        padding: 'var(--sv-space-3) var(--sv-space-4)',
        display: 'flex',
        gap: 'var(--sv-space-2)',
        alignItems: 'flex-start',
        marginTop: 'var(--sv-space-4)',
      }}
    >
      <span style={{ color: c.text, fontWeight: 700, flexShrink: 0, fontSize: '0.875rem' }}>
        {c.label}
      </span>
      <p
        style={{
          fontFamily: ff,
          fontSize: 'var(--sv-font-size-sm)',
          color: c.text,
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        {children}
      </p>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-lg)',
        overflow: 'hidden',
        fontFamily: ff,
        fontSize: 'var(--sv-font-size-sm)',
      }}
    >
      {children}
    </div>
  );
}

function ContentPlaceholder({ label = 'Plugin content area' }: { label?: string }) {
  return (
    <div
      style={{
        background: 'var(--sv-color-surface-sunken)',
        padding: 'var(--sv-space-6) var(--sv-space-4)',
        textAlign: 'center',
        color: 'var(--sv-color-text-muted)',
        fontSize: 'var(--sv-font-size-xs)',
      }}
    >
      {label}
    </div>
  );
}

function IconButton({ name, label }: { name: Parameters<typeof Icon>[0]['name']; label: string }) {
  return (
    <span
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 'var(--sv-radius-md)',
        color: 'var(--sv-color-text-muted)',
      }}
    >
      <Icon name={name} size="md" aria-hidden />
    </span>
  );
}

function Avatar({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <span
      aria-label={initials}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 'var(--sv-radius-full)',
        background: 'var(--sv-color-accent)',
        color: 'var(--sv-color-text-on-accent)',
        fontSize: 'var(--sv-font-size-xs)',
        fontWeight: 'var(--sv-font-weight-semibold)',
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function BrandBadge({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 'var(--sv-radius-md)',
        background: 'var(--sv-color-accent)',
        color: 'var(--sv-color-text-on-accent)',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      S
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1. Web with Sidebar
// ---------------------------------------------------------------------------

function WebWithSidebar() {
  return (
    <Frame>
      <div style={{ display: 'flex', minHeight: 240 }}>
        <div
          style={{
            width: 64,
            flexShrink: 0,
            background: 'var(--sv-color-surface)',
            borderRight: '1px solid var(--sv-color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--sv-space-3)',
            padding: 'var(--sv-space-3) 0',
          }}
        >
          <BrandBadge />
          <hr
            style={{
              width: 32,
              border: 'none',
              borderTop: '1px solid var(--sv-color-border)',
              margin: 0,
            }}
          />
          <IconButton name="file" label="Notes" />
          <IconButton name="house" label="Launcher" />
          <div style={{ flex: 1 }} />
          <IconButton name="bell" label="Notifications" />
          <IconButton name="layout-dashboard" label="Console" />
          <Avatar initials="KB" size={32} />
        </div>
        <div style={{ flex: 1 }}>
          <ContentPlaceholder />
        </div>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// 2. Web with Header
// ---------------------------------------------------------------------------

const layoutSystemLauncherItems = [
  {
    key: 'home',
    icon: <Icon name="house" size="md" aria-hidden />,
    label: 'Home',
    href: '/launcher',
  },
  {
    key: 'notes',
    icon: <Icon name="file" size="md" aria-hidden />,
    label: 'Notes',
    href: '/notes',
  },
];

const layoutSystemAccountItems = [
  { label: 'Account', icon: 'user' as const, href: '/account' },
  { label: 'Sign out', icon: 'log-out' as const, destructive: true, onSelect: () => {} },
];

function WebWithHeader() {
  return (
    <Frame>
      <Header
        instanceName="Sovereign"
        homeHref="/launcher"
        plugin={{
          name: 'Notes',
          // The plugin icon is 28px — same size as the brand badge next to
          // it, not a smaller inline glyph.
          icon: (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
              }}
            >
              <span style={{ display: 'inline-flex', transform: 'scale(1.15)' }}>
                <Icon name="file" size="lg" aria-hidden />
              </span>
            </span>
          ),
          href: '/notes',
        }}
        launcher={<AppsLauncher items={layoutSystemLauncherItems} />}
        notifications={<NotificationsPanel items={[]} unreadCount={0} />}
        avatarMenu={<UserMenu name="Kasun Benthara" items={layoutSystemAccountItems} size="sm" />}
      />
      <ContentPlaceholder />
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// 3. Mobile Header and Footer
// ---------------------------------------------------------------------------

function MobileHeaderAndFooter() {
  return (
    <Frame>
      <MobileHeader
        title="Tasks"
        bell={<IconButton name="bell" label="Notifications" />}
        avatarMenu={<Avatar initials="JD" size={36} />}
      />
      <ContentPlaceholder />
      <MobileFooter
        onOpenApps={() => {}}
        launcherOpen={false}
        leftIcons={[
          { icon: <Icon name="house" size="md" aria-hidden />, label: 'Home', active: true },
        ]}
        rightIcons={[{ icon: <Icon name="search" size="md" aria-hidden />, label: 'Search' }]}
      />
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// 4. Mobile Header, Secondary Header (Page Header)
// ---------------------------------------------------------------------------

function MobileSecondaryPageHeader() {
  return (
    <Frame>
      <MobileHeader
        title="Sovereign"
        bell={<IconButton name="bell" label="Notifications" />}
        avatarMenu={<Avatar initials="KB" size={36} />}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sv-space-2)',
          padding: 'var(--sv-space-2) var(--sv-space-3)',
          background: 'var(--sv-color-surface)',
          borderBottom: '1px solid var(--sv-color-border)',
        }}
      >
        <IconButton name="circle-chevron-left" label="Back to boards" />
        <span
          style={{
            flex: 1,
            fontWeight: 600,
            fontSize: 'var(--sv-font-size-md)',
            color: 'var(--sv-color-text-primary)',
          }}
        >
          Infra Migration
        </span>
        <IconButton name="ellipsis-vertical" label="Board options" />
      </div>
      <ContentPlaceholder label="Board content (lists/cards)" />
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// 5. Mobile Header, Secondary Header (Dialog Header)
// ---------------------------------------------------------------------------

function MobileSecondaryDialogHeader() {
  return (
    <Frame>
      <MobileHeader
        bell={<IconButton name="bell" label="Notifications" />}
        avatarMenu={<Avatar initials="KB" size={36} />}
      />
      <OverlayHeader
        title="Console"
        onClose={() => {}}
        secondRow={
          <nav aria-label="Console sections" style={{ display: 'flex', gap: 'var(--sv-space-4)' }}>
            {['Overview', 'Users', 'Settings'].map((label, i) => (
              <span
                key={label}
                style={{
                  fontSize: 'var(--sv-font-size-sm)',
                  fontWeight: i === 0 ? 600 : 400,
                  color: i === 0 ? 'var(--sv-color-text-primary)' : 'var(--sv-color-text-muted)',
                  paddingBottom: 'var(--sv-space-2)',
                  borderBottom: i === 0 ? '2px solid var(--sv-color-accent)' : 'none',
                }}
              >
                {label}
              </span>
            ))}
          </nav>
        }
      />
      <ContentPlaceholder label="Console page content" />
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// 6. Structural Layout Primitives
// ---------------------------------------------------------------------------

function StructuralLayoutPrimitives() {
  return (
    <Frame>
      <div style={{ height: 320 }}>
        <RootLayout variant="sidebar">
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--sv-color-surface)',
              borderRight: '1px solid var(--sv-color-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--sv-space-3)',
              padding: 'var(--sv-space-3) 0',
            }}
          >
            <BrandBadge />
            <IconButton name="house" label="Home" />
            <IconButton name="layers" label="Boards" />
          </div>
          <PageLayout
            padding="md"
            header={
              <PageHeader
                title="Boards"
                description="Everything you're tracking."
                action={<IconButton name="search" label="Search" />}
              />
            }
          >
            <ContentPlaceholder label="Page content" />
          </PageLayout>
        </RootLayout>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Main story component
// ---------------------------------------------------------------------------

function LayoutSystemDoc() {
  return (
    <div
      style={{
        padding: 'var(--sv-space-6)',
        background: 'var(--sv-color-surface)',
        minHeight: '100vh',
        fontFamily: ff,
        maxWidth: 760,
      }}
    >
      <div style={{ marginBottom: 'var(--sv-space-8)' }}>
        <Heading level={1}>Layout System</Heading>
        <Body>
          The shell-chrome archetypes in use across the platform and its plugins today. Sections 1–5
          each show the actual anatomy shipping in the code, cite their source, and flag where the
          pattern is a shared design-system component versus a per-plugin reimplementation still
          waiting to be extracted. Section 6 introduces a newer, general-purpose layer built on top
          of that: structural layout primitives any plugin can compose directly, rather than
          reimplementing shell chrome from scratch.
        </Body>
      </div>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="1. Web with Sidebar"
          subtitle="The default desktop shell — a fixed vertical icon rail. shell: default (most plugins)."
          source="runtime/app/(platform)/layout.tsx"
        />
        <WebWithSidebar />
        <Callout type="warn">
          Hand-rolled directly in the runtime shell — never extracted into <code>packages/ui</code>,
          unlike <code>MobileHeader</code>/<code>MobileFooter</code> (RFC 0088). A general-purpose
          version of this exact shape now exists as <code>RootLayout</code>'s{' '}
          <code>variant=&quot;sidebar&quot;</code> (see Section 6 and{' '}
          <code>Components/RootLayout</code>) — the runtime shell itself hasn't been migrated onto
          it yet, so this section still documents its own hand-rolled markup as the source of truth
          for what's actually shipping.
        </Callout>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="2. Web with Header"
          subtitle="A full-width top bar in place of the sidebar. shell: minimal plugins that own their whole viewport."
          source="@sovereignfs/ui — Header, generalized from a real shell: minimal plugin's own hand-rolled top bar"
        />
        <WebWithHeader />
        <Callout type="tip">
          The chrome/layout, the apps switcher, notifications, and the account dropdown are all now
          shared design-system components (<code>Header</code>, <code>AppsLauncher</code>,{' '}
          <code>NotificationsPanel</code>, <code>UserMenu</code>) — generalized from a real{' '}
          <code>shell: minimal</code> plugin's own hand-rolled top bar, apps switcher, notification
          bell, and account menu. A future <code>shell: minimal</code> plugin no longer has to
          rebuild any of this from scratch.
        </Callout>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="3. Mobile Header and Footer"
          subtitle="Brand/title + bell + avatar on top; a single Apps launcher button on the bottom."
          source="@sovereignfs/ui — MobileHeader, MobileFooter (RFC 0088)"
        />
        <MobileHeaderAndFooter />
        <Callout type="tip">
          Already a shared design-system component, consumed by both the platform shell and{' '}
          <code>shell: minimal</code> plugins. See the interactive prop playground in{' '}
          <code>Overview/Mobile Patterns</code>.
        </Callout>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="4. Mobile Header, Secondary Header (Page Header)"
          subtitle="A contextual second row — back + title + options — stacked directly under MobileHeader as ordinary page content."
          source="A real shell: minimal plugin's own bespoke board-detail header"
        />
        <MobileSecondaryPageHeader />
        <Callout type="tip">
          The API gap flagged here is now closed: <code>PageHeader</code>'s mobile fork (
          <code>onBack</code> + <code>onMenuClick</code>, see <code>Components/PageHeader</code>)
          was generalized directly from this plugin's own <code>MobileBoardHeader</code> and renders
          this exact back + title + ellipsis-vertical shape. The plugin itself hasn't been migrated
          onto it yet — its own hand-rolled version, shown above, is still what's actually shipping
          — but any new mobile secondary header no longer needs to reimplement this from scratch.
        </Callout>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="5. Mobile Header, Secondary Header (Dialog Header)"
          subtitle="The same contextual second row, but lifted into the enclosing overlay's own header when the plugin is soft-navigated as a Dialog."
          source="packages/ui — useOverlaySecondRow + Dialog's OverlayHeader; see plugins/console, plugins/account"
        />
        <MobileSecondaryDialogHeader />
        <Callout type="tip">
          Already a shared pattern — <code>useOverlaySecondRow</code> hands a plugin's own nav strip
          up into <code>Dialog</code>'s <code>OverlayHeader.secondRow</code> whenever the plugin is
          opened as an overlay, with no duplicated markup.
        </Callout>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="6. Structural Layout Primitives"
          subtitle="RootLayout + PageLayout + PageHeader composed together — the sidebar shape from Section 1, with a page-level header and content area nested inside."
          source="@sovereignfs/ui — RootLayout, ThreeColumnLayout, HeaderFooterLayout, PageLayout, PageHeader"
        />
        <StructuralLayoutPrimitives />
        <Callout type="tip">
          Unlike sections 1–5, these aren't documenting one specific plugin's shipped code — they're
          general-purpose primitives any plugin can adopt directly today. <code>RootLayout</code> is
          the root a plugin's page tree sits in (<code>variant</code>: plain, sidebar, header, or
          shell — each a fixed web+mobile pairing); <code>ThreeColumnLayout</code> and{' '}
          <code>HeaderFooterLayout</code> are the positional primitives it composes internally, also
          usable standalone for a list-app's own nested split view; <code>PageLayout</code> is a
          single page's content area nested inside <code>RootLayout</code>'s main slot, intended to
          eventually replace <code>PageContainer</code> entirely; <code>PageHeader</code> is that
          page's title section, with its own web/mobile fork (see the Section 1 and 4 callouts above
          for exactly which real shell-chrome gaps it closes). Each has its own interactive
          Storybook page under <code>Components/</code> with the full prop playground.
        </Callout>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

const meta = {
  title: 'Overview/Layout System',
  component: LayoutSystemDoc,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Catalog of the shell-chrome layout archetypes in use across the platform and its plugins — which are shared design-system components and which are still per-plugin reimplementations.',
      },
    },
  },
} satisfies Meta<typeof LayoutSystemDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
