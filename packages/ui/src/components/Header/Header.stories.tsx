import type { Meta, StoryObj } from '@storybook/react-vite';
import { Header } from './Header';
import { MobileHeader } from '../MobileHeader/MobileHeader';
import { AppsLauncher } from '../AppsLauncher/AppsLauncher';
import { Icon, type IconName } from '../Icon/Icon';
import { NotificationsPanel } from '../NotificationsPanel/NotificationsPanel';
import { UserMenu } from '../UserMenu/UserMenu';
import { useIsMobile } from '../../hooks';

// ---------------------------------------------------------------------------
// Shared doc primitives (mirrors Overview/Mobile Patterns' own doc styling)
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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
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
    </div>
  );
}

function Callout({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warn' | 'tip';
  children: React.ReactNode;
}) {
  const map = {
    info: {
      bg: 'var(--sv-color-info-surface)',
      border: 'var(--sv-color-info-border)',
      text: 'var(--sv-color-info-text)',
      label: 'ℹ',
    },
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
        marginBottom: 'var(--sv-space-4)',
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

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        fontFamily: 'var(--sv-font-family-mono)',
        fontSize: '0.75rem',
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        padding: 'var(--sv-space-3) var(--sv-space-4)',
        marginTop: 'var(--sv-space-3)',
        overflowX: 'auto',
        color: 'var(--sv-color-text-primary)',
        lineHeight: 1.6,
      }}
    >
      {children}
    </pre>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-lg)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo pieces — the real, shared AppsLauncher/NotificationsPanel/UserMenu,
// not story-local mockups.
// ---------------------------------------------------------------------------

/**
 * The plugin icon renders at the same 28px as the brand badge next to it,
 * not a smaller inline glyph. `Icon`'s largest built-in size (`lg`, 24px)
 * reads slightly small in a 28px box (lucide-style glyphs carry their own
 * internal inset), so it's scaled up the remaining bit to actually fill the
 * box, the same way a real 28px plugin-icon `<img>` asset would.
 */
function HeaderPluginIcon({ name }: { name: IconName }) {
  return (
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
        <Icon name={name} size="lg" aria-hidden />
      </span>
    </span>
  );
}

const launcherItems = [
  {
    key: 'home',
    icon: <Icon name="house" size="md" aria-hidden />,
    label: 'Home',
    href: '/launcher',
  },
  {
    key: 'console',
    icon: <Icon name="layout-dashboard" size="md" aria-hidden />,
    label: 'Console',
    href: '/console',
  },
  {
    key: 'notes',
    icon: <Icon name="file" size="md" aria-hidden />,
    label: 'Notes',
    href: '/notes',
  },
];

const notificationItems = [
  {
    id: '1',
    icon: <Icon name="layers" size="sm" aria-hidden />,
    title: 'Added to a project',
    timeLabel: '2d ago',
    read: false,
    onDismiss: () => {},
  },
];

const accountItems = [
  { label: 'Account', icon: 'user' as const, href: '/account' },
  { label: 'Preferences', icon: 'sliders-horizontal' as const, href: '/account/preferences' },
  { label: 'Sign out', icon: 'log-out' as const, destructive: true, onSelect: () => {} },
];

function Launcher() {
  return <AppsLauncher items={launcherItems} />;
}

function Notifications() {
  return <NotificationsPanel items={notificationItems} unreadCount={1} />;
}

function Account() {
  return <UserMenu name="Kasun Benthara" email="kasun@openfs.io" items={accountItems} size="sm" />;
}

/**
 * `Header` is web-only (`shell: minimal`'s desktop top bar) — a plugin
 * renders its own mobile equivalent alongside it, gated with `useIsMobile`
 * (not CSS, to avoid mounting the wrong chrome's hooks on the wrong
 * surface). Resize the Storybook viewport below 768px to see `MobileHeader`
 * render instead. The launcher/notifications/avatar triggers are the real,
 * shared `AppsLauncher`/`NotificationsPanel`/`UserMenu` components — shared
 * verbatim across both branches, not two implementations of the same
 * dropdown, and fully clickable here.
 */
function ResponsiveHeaderDemo() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileHeader title="Sovereign" bell={<Notifications />} avatarMenu={<Account />} />;
  }

  return (
    <Header
      instanceName="Sovereign"
      homeHref="/launcher"
      plugin={{
        name: 'Notes',
        icon: <HeaderPluginIcon name="file" />,
        href: '/notes',
      }}
      launcher={<Launcher />}
      notifications={<Notifications />}
      avatarMenu={<Account />}
    />
  );
}

// ---------------------------------------------------------------------------
// Default — the documentation page
// ---------------------------------------------------------------------------

function HeaderDoc() {
  return (
    <div
      style={{
        padding: 'var(--sv-space-6)',
        background: 'var(--sv-color-surface)',
        minHeight: '100vh',
        fontFamily: ff,
        maxWidth: 760,
        margin: '0 auto',
      }}
    >
      <div style={{ marginBottom: 'var(--sv-space-8)' }}>
        <Heading level={1}>Header</Heading>
        <Body>
          The web top-bar header for <code>shell: minimal</code> plugins — a plugin that owns its
          whole viewport (no platform sidebar) renders this instead, so it doesn't have to hand-roll
          its own top bar from scratch.
        </Body>
      </div>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Live demo"
          subtitle="Real, clickable components — not mockups. Resize the Storybook viewport below 768px to see MobileHeader render instead of a squeezed desktop bar."
        />
        <Frame>
          <ResponsiveHeaderDemo />
        </Frame>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Anatomy"
          subtitle="Brand badge + optional active plugin on the left; launcher, notifications, and avatar menu on the right — always rendered, never optional."
        />
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--sv-color-text-muted)' }}>
          <li>
            <strong style={{ color: 'var(--sv-color-text-primary)' }}>Brand badge</strong> — derives
            its initial from <code>instanceName</code>, links to <code>homeHref</code>.
          </li>
          <li>
            <strong style={{ color: 'var(--sv-color-text-primary)' }}>Active plugin</strong> (
            <code>plugin</code>, optional) — icon + name, links to <code>plugin.href</code>.
          </li>
          <li>
            <strong style={{ color: 'var(--sv-color-text-primary)' }}>launcher</strong> — the real{' '}
            <code>AppsLauncher</code>.
          </li>
          <li>
            <strong style={{ color: 'var(--sv-color-text-primary)' }}>notifications</strong> — the
            real <code>NotificationsPanel</code>.
          </li>
          <li>
            <strong style={{ color: 'var(--sv-color-text-primary)' }}>avatarMenu</strong> — the real{' '}
            <code>UserMenu</code> (<code>size=&quot;sm&quot;</code> in this context — see Sizing
            below).
          </li>
        </ul>
        <CodeBlock>{`<Header
  instanceName="Sovereign"
  homeHref="/launcher"
  plugin={{ name: 'Notes', icon: <PluginIcon />, href: '/notes' }}
  launcher={<AppsLauncher items={apps} />}
  notifications={<NotificationsPanel items={items} unreadCount={n} />}
  avatarMenu={<UserMenu name={user.name} email={user.email} items={menuItems} size="sm" />}
/>`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader title="Boundary — presentational only" />
        <Body>
          <code>Header</code> owns layout only — never launcher/notification/account interaction
          logic, matching <code>MobileHeader</code>&apos;s own boundary (RFC 0088).{' '}
          <code>launcher</code>/<code>notifications</code>/<code>avatarMenu</code> are supplied
          fully built by the consumer. In practice that consumer is almost always the real{' '}
          <code>AppsLauncher</code>/<code>NotificationsPanel</code>/<code>UserMenu</code> — see
          their own Components pages — not a bespoke reimplementation.
        </Body>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-6)' }}>
        <SectionHeader
          title="Sizing"
          subtitle="A compact top bar, deliberately smaller than the platform sidebar — this plugin owns its whole viewport, so it isn't bound to platform chrome dimensions."
        />
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--sv-color-text-muted)' }}>
          <li>Bar height: 49px (48px content + 1px border).</li>
          <li>Brand badge / plugin icon: 28px.</li>
          <li>Launcher / notifications trigger buttons: 28px, with a 20–24px icon inside.</li>
          <li>
            Avatar: 32px here (<code>UserMenu size=&quot;sm&quot;</code>) — smaller than the
            platform sidebar&apos;s own 36px avatar (<code>UserMenu</code>&apos;s default), to suit
            this compact top bar&apos;s own proportions.
          </li>
        </ul>
        <Callout type="tip">
          Want to try different <code>instanceName</code>/<code>homeHref</code>/<code>plugin</code>{' '}
          values live? See the <strong>Playground</strong> story — its Controls panel is wired up
          for exactly that.
        </Callout>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

const meta = {
  title: 'Components/Header',
  component: Header,
  parameters: {
    // fullscreen, not padded — this is a full-bleed top bar; Storybook's own
    // canvas gutter around a `padded` story reads as extra height in a
    // screenshot comparison against the real, edge-to-edge running app. The
    // Default doc page supplies its own centered/padded wrapper internally.
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The web top-bar header for shell: minimal plugins — the counterpart to the platform sidebar for a plugin that owns its whole viewport. Brand badge and optional active plugin on the left; launcher (AppsLauncher), notifications (NotificationsPanel), and avatar menu (UserMenu) on the right. Below 768px, plugins render MobileHeader instead.',
      },
    },
  },
  argTypes: {
    instanceName: { control: 'text' },
    homeHref: { control: 'text' },
    plugin: { control: 'object' },
    launcher: { control: false },
    notifications: { control: false },
    avatarMenu: { control: false },
  },
  args: {
    instanceName: 'Sovereign',
    homeHref: '/launcher',
    plugin: {
      name: 'Notes',
      icon: <HeaderPluginIcon name="file" />,
      href: '/notes',
    },
    launcher: <Launcher />,
    notifications: <Notifications />,
    avatarMenu: <Account />,
  },
} satisfies Meta<typeof Header>;

export default meta;
type StoryDetail = StoryObj<typeof meta>;

export const Story: StoryDetail = {
  parameters: {
    controls: { disable: true },
  },
  render: () => <HeaderDoc />,
};

/**
 * A plain, bare `Header` — use the Controls panel below to try different
 * `instanceName`/`homeHref`/`plugin` values live. `launcher`/`notifications`/
 * `avatarMenu` stay fixed to the real shared components (they're ReactNode
 * slots — not meaningfully editable as Controls). `plugin.icon` is omitted
 * here (unlike the live demo above) so the object control stays plain,
 * editable JSON rather than a React element it can't serialize.
 */
export const Playground: StoryDetail = {
  args: {
    plugin: {
      name: 'Notes',
      href: '/notes',
    },
  },
};
