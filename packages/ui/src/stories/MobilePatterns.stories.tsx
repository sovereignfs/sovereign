import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Dialog } from '../components/Dialog/Dialog';
import { Drawer } from '../components/Drawer/Drawer';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FormField } from '../components/FormField/FormField';
import { Input } from '../components/Input/Input';
import { NavTabs } from '../components/NavTabs/NavTabs';
import { PageHeader } from '../components/PageHeader/PageHeader';

// ---------------------------------------------------------------------------
// Shared primitives
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

function BreakpointRow({ px, name, behavior }: { px: number; name: string; behavior: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 140px 1fr',
        alignItems: 'center',
        gap: 'var(--sv-space-3)',
        padding: 'var(--sv-space-2) 0',
        borderBottom: '1px solid var(--sv-color-border)',
        fontFamily: ff,
        fontSize: 'var(--sv-font-size-sm)',
      }}
    >
      <code
        style={{
          fontFamily: 'var(--sv-font-family-mono)',
          fontSize: '0.75rem',
          background: 'var(--sv-color-surface-sunken)',
          padding: '2px 6px',
          borderRadius: 'var(--sv-radius-sm)',
          color: 'var(--sv-color-text-primary)',
        }}
      >
        {px}px
      </code>
      <span style={{ color: 'var(--sv-color-text-primary)', fontWeight: 600 }}>{name}</span>
      <span style={{ color: 'var(--sv-color-text-muted)' }}>{behavior}</span>
    </div>
  );
}

function TouchTargetDemo({ label, size }: { label: string; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sv-space-3)' }}>
      <div
        style={{
          width: size,
          height: size,
          background:
            size >= 44 ? 'var(--sv-color-success-surface)' : 'var(--sv-color-warning-surface)',
          border: `1px solid ${size >= 44 ? 'var(--sv-color-success-border)' : 'var(--sv-color-warning-border)'}`,
          borderRadius: 'var(--sv-radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--sv-font-family-mono)',
            fontSize: '0.6875rem',
            color: size >= 44 ? 'var(--sv-color-success-text)' : 'var(--sv-color-warning-text)',
            fontWeight: 600,
          }}
        >
          {size}px
        </span>
      </div>
      <span
        style={{
          fontFamily: ff,
          fontSize: 'var(--sv-font-size-sm)',
          color: 'var(--sv-color-text-muted)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive demos
// ---------------------------------------------------------------------------

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mobile dialog" size="md">
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-sm)',
            color: 'var(--sv-color-text-muted)',
            margin: 0,
          }}
        >
          On screens ≤ 768 px this panel slides up from the bottom as a full-width sheet. On larger
          screens it appears centered. Resize the viewport to see the difference.
        </p>
        <div
          style={{ marginTop: 'var(--sv-space-4)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <Button size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function DrawerDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Open drawer
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} aria-label="Mobile navigation">
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-sm)',
            color: 'var(--sv-color-text-muted)',
            margin: 0,
          }}
        >
          Drawer is always a bottom sheet — it never becomes a side panel. Use it for plugin grids,
          navigation menus, or contextual actions on mobile. Respects{' '}
          <code style={{ fontFamily: 'var(--sv-font-family-mono)', fontSize: '0.75rem' }}>
            env(safe-area-inset-bottom)
          </code>{' '}
          for devices with a home indicator.
        </p>
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main story component
// ---------------------------------------------------------------------------

function MobilePatternsDoc() {
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
        <Heading level={1}>Mobile Patterns</Heading>
        <Body>
          Plugin developer reference for building layouts that work at 375 px (mobile), 768 px
          (tablet), and 1280 px (desktop). Use the viewport toolbar above to preview each size. The
          Sovereign shell handles the chrome (sidebar ↔ bottom nav, drawer) — plugins only need to
          own their content area.
        </Body>
      </div>

      {/* ── Breakpoints ── */}
      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Breakpoints"
          subtitle="Two breakpoints in use across the design system. No token variables — use the pixel values directly in your CSS."
        />
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 140px 1fr',
              gap: 'var(--sv-space-3)',
              padding: 'var(--sv-space-2) 0',
              fontFamily: ff,
              fontSize: 'var(--sv-font-size-xs)',
              fontWeight: 700,
              color: 'var(--sv-color-text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              borderBottom: '2px solid var(--sv-color-border)',
            }}
          >
            <span>Width</span>
            <span>Name</span>
            <span>What changes</span>
          </div>
          <BreakpointRow
            px={640}
            name="sm"
            behavior="NavTabs switches to horizontal scroll (no visible scrollbar)."
          />
          <BreakpointRow
            px={768}
            name="md"
            behavior="Shell sidebar becomes a bottom nav + drawer. Dialog becomes a full-screen bottom sheet."
          />
        </div>
        <Callout type="info">
          Use{' '}
          <code style={{ fontFamily: 'var(--sv-font-family-mono)', fontSize: '0.8em' }}>
            max-width: 768px
          </code>{' '}
          for the primary mobile breakpoint in your plugin CSS. Components below this width are
          already adapted by the design system.
        </Callout>
      </section>

      {/* ── Layout conventions ── */}
      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Layout conventions"
          subtitle="Patterns used across all built-in plugins."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-5)' }}>
          <Card padding="md">
            <Heading level={3}>Constrained content column</Heading>
            <Body>
              Wrap your page content in a centered column with a readable max-width. All built-in
              plugins use this pattern. Content fills full width below 640 px automatically.
            </Body>
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
              {`.page {
  max-width: 680px;      /* or 720px for wider layouts */
  margin: 0 auto;
  padding: var(--sv-space-6) var(--sv-space-4);
}

@media (max-width: 768px) {
  .page {
    padding: var(--sv-space-4);
  }
}`}
            </pre>
          </Card>

          <Card padding="md">
            <Heading level={3}>PageHeader on mobile</Heading>
            <Body>
              PageHeader stacks its action below the title on narrow viewports. Pass a compact
              action (a single small Button) — avoid toolbars with multiple controls.
            </Body>
            <div style={{ marginTop: 'var(--sv-space-4)' }}>
              <PageHeader
                title="Settings"
                description="Manage your plugin preferences."
                action={<Button size="sm">Save</Button>}
              />
            </div>
          </Card>

          <Card padding="md">
            <Heading level={3}>Form layout</Heading>
            <Body>
              Forms are always single-column on mobile. Never use multi-column grid layouts for form
              fields — they're too narrow below 640 px.
            </Body>
            <div
              style={{
                marginTop: 'var(--sv-space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sv-space-3)',
              }}
            >
              <FormField label="Display name" htmlFor="mp-name">
                <Input id="mp-name" placeholder="Your name" />
              </FormField>
              <FormField label="Email" htmlFor="mp-email">
                <Input id="mp-email" type="email" placeholder="you@example.com" />
              </FormField>
              <Button type="submit">Save changes</Button>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Auto-adapting components ── */}
      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Auto-adapting components"
          subtitle="These components change behaviour at the 640 px or 768 px breakpoint automatically — no extra work needed."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-5)' }}>
          <Card padding="md">
            <Heading level={3}>NavTabs — horizontal scroll below 640 px</Heading>
            <Body>
              Tabs overflow horizontally with no visible scrollbar below 640 px. Use the{' '}
              <em>Mobile</em> viewport to test overflow.
            </Body>
            <div style={{ marginTop: 'var(--sv-space-4)' }}>
              <NavTabs
                items={[
                  { label: 'Profile', href: '#', active: true },
                  { label: 'Security', href: '#' },
                  { label: 'Preferences', href: '#' },
                  { label: 'Notifications', href: '#' },
                  { label: 'Billing', href: '#' },
                  { label: 'Data', href: '#' },
                ]}
              />
            </div>
          </Card>

          <Card padding="md">
            <Heading level={3}>Dialog — full-screen sheet below 768 px</Heading>
            <Body>
              Dialog slides up as a bottom sheet on mobile — identical to native OS sheets. No size
              prop differences needed; all sizes become full-screen below 768 px.
            </Body>
            <div style={{ marginTop: 'var(--sv-space-4)' }}>
              <DialogDemo />
            </div>
          </Card>

          <Card padding="md">
            <Heading level={3}>Drawer — always a bottom sheet</Heading>
            <Body>
              Drawer is the component the shell uses for the mobile plugin navigation grid. Your
              plugin can use it for contextual navigation menus or action sheets. It always occupies
              the bottom of the screen regardless of viewport width.
            </Body>
            <div style={{ marginTop: 'var(--sv-space-4)' }}>
              <DrawerDemo />
            </div>
          </Card>

          <Card padding="md">
            <Heading level={3}>EmptyState — centered, narrow</Heading>
            <Body>
              EmptyState constrains its content to{' '}
              <code style={{ fontFamily: 'var(--sv-font-family-mono)', fontSize: '0.8em' }}>
                36ch
              </code>{' '}
              and works well at all widths. No extra handling needed.
            </Body>
            <div style={{ marginTop: 'var(--sv-space-4)' }}>
              <EmptyState
                icon="search"
                heading="Nothing here yet"
                description="Add your first item to get started."
                action={<Button size="sm">Add item</Button>}
              />
            </div>
          </Card>
        </div>
      </section>

      {/* ── Touch targets ── */}
      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Touch targets"
          subtitle="WCAG 2.5.5 (AAA) recommends 44 × 44 px minimum for interactive elements. All design system buttons meet this by default."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-3)' }}>
          <TouchTargetDemo
            label="Button (sm) — 32 px visual, but padded to 44 px tap area via inline-flex"
            size={44}
          />
          <TouchTargetDemo label="Button (md) — 44 px height" size={44} />
          <TouchTargetDemo label="Button (lg) — 52 px height" size={52} />
          <TouchTargetDemo
            label="Avoid — 28 px tap area is too small for confident tapping"
            size={28}
          />
        </div>
        <Callout type="tip">
          When building custom interactive elements (icon-only buttons, list rows, toggle rows), add
          explicit{' '}
          <code style={{ fontFamily: 'var(--sv-font-family-mono)', fontSize: '0.8em' }}>
            min-height: 44px
          </code>{' '}
          and enough horizontal padding to make the tap area comfortable.
        </Callout>
      </section>

      {/* ── Safe area insets ── */}
      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Safe area insets"
          subtitle="iOS devices with a home indicator and Android devices with gesture navigation require bottom clearance. The shell handles this for its own chrome; plugins only need to account for it on fixed-bottom elements."
        />
        <Callout type="warn">
          If your plugin has a sticky/fixed footer bar (e.g., a compose toolbar), add{' '}
          <code style={{ fontFamily: 'var(--sv-font-family-mono)', fontSize: '0.8em' }}>
            padding-bottom: env(safe-area-inset-bottom)
          </code>{' '}
          to it. The Drawer already does this.
        </Callout>
        <pre
          style={{
            fontFamily: 'var(--sv-font-family-mono)',
            fontSize: '0.75rem',
            background: 'var(--sv-color-surface-sunken)',
            border: '1px solid var(--sv-color-border)',
            borderRadius: 'var(--sv-radius-md)',
            padding: 'var(--sv-space-3) var(--sv-space-4)',
            overflowX: 'auto',
            color: 'var(--sv-color-text-primary)',
            lineHeight: 1.6,
          }}
        >
          {`.stickyFooter {
  position: sticky;
  bottom: 0;
  /* clears the home indicator bar on iOS/Android */
  padding-bottom: max(var(--sv-space-3), env(safe-area-inset-bottom));
  background: var(--sv-color-surface);
  border-top: 1px solid var(--sv-color-border);
}`}
        </pre>
      </section>

      {/* ── Typography ── */}
      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Typography on mobile"
          subtitle="All --sv-font-size-* tokens are fixed values — they do not scale with viewport. Use them as-is; they were calibrated for legibility at 375 px."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-3)' }}>
          {[
            { token: '--sv-font-size-xs', hint: 'Labels, captions. Minimum for body text.' },
            { token: '--sv-font-size-sm', hint: 'Default body text. Use for most content.' },
            { token: '--sv-font-size-md', hint: 'Slightly larger body. Section intros.' },
            { token: '--sv-font-size-lg', hint: 'Sub-headings, card titles.' },
            { token: '--sv-font-size-xl', hint: 'Page headings (h2 equivalent).' },
            { token: '--sv-font-size-2xl', hint: 'Hero headings. Use sparingly on mobile.' },
          ].map(({ token, hint }) => (
            <div
              key={token}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--sv-space-4)',
                borderBottom: '1px solid var(--sv-color-border)',
                padding: 'var(--sv-space-2) 0',
              }}
            >
              <span
                style={{
                  fontFamily: ff,
                  fontSize: `var(${token})`,
                  color: 'var(--sv-color-text-primary)',
                  lineHeight: 1.2,
                  flexShrink: 0,
                }}
              >
                Aa
              </span>
              <code
                style={{
                  fontFamily: 'var(--sv-font-family-mono)',
                  fontSize: '0.6875rem',
                  color: 'var(--sv-color-text-muted)',
                  minWidth: 200,
                }}
              >
                {token}
              </code>
              <span
                style={{
                  fontFamily: ff,
                  fontSize: 'var(--sv-font-size-xs)',
                  color: 'var(--sv-color-text-subtle)',
                }}
              >
                {hint}
              </span>
            </div>
          ))}
        </div>
        <Callout type="info">
          Line lengths should stay between 45–75 characters per line for comfortable reading. The{' '}
          <code style={{ fontFamily: 'var(--sv-font-family-mono)', fontSize: '0.8em' }}>
            max-width: 680px
          </code>{' '}
          container enforces this on wide viewports; on mobile the full width is fine because the
          viewport itself constrains line length.
        </Callout>
      </section>

      {/* ── Checklist ── */}
      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader title="Mobile readiness checklist" />
        {[
          {
            done: true,
            text: 'Content column has a max-width (680–720 px) and horizontal padding (--sv-space-4).',
          },
          { done: true, text: 'Forms are single-column — never two-column grids below 640 px.' },
          { done: true, text: 'All tap targets are ≥ 44 × 44 px.' },
          { done: true, text: 'NavTabs used for page-level navigation (not a custom tab row).' },
          { done: true, text: 'Dialogs use Dialog component (auto full-screen on mobile).' },
          { done: true, text: 'Fixed/sticky footers have env(safe-area-inset-bottom) padding.' },
          { done: true, text: 'No hardcoded pixel widths on content — use max-width instead.' },
          { done: true, text: 'Dark mode tested — use semantic --sv-color-* tokens only.' },
        ].map(({ done, text }, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--sv-space-3)',
              padding: 'var(--sv-space-2) 0',
              borderBottom: '1px solid var(--sv-color-border)',
            }}
          >
            <span
              style={{
                color: done ? 'var(--sv-color-success-text)' : 'var(--sv-color-text-subtle)',
                fontWeight: 700,
                flexShrink: 0,
                fontSize: 'var(--sv-font-size-sm)',
              }}
            >
              {done ? '✓' : '○'}
            </span>
            <span
              style={{
                fontFamily: ff,
                fontSize: 'var(--sv-font-size-sm)',
                color: 'var(--sv-color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              {text}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

const meta = {
  title: 'Overview/Mobile Patterns',
  component: MobilePatternsDoc,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: {
      description: {
        component:
          'Plugin developer reference for mobile-responsive layouts. Switch to the Mobile viewport (375 px) in the toolbar to preview at target size.',
      },
    },
  },
} satisfies Meta<typeof MobilePatternsDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MobileView: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

export const TabletView: Story = {
  parameters: { viewport: { defaultViewport: 'tablet' } },
};

export const DesktopView: Story = {
  parameters: { viewport: { defaultViewport: 'desktop' } },
};
