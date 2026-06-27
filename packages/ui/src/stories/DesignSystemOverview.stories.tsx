import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from '../components/Avatar/Avatar';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Dialog } from '../components/Dialog/Dialog';
import { Drawer } from '../components/Drawer/Drawer';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FormField } from '../components/FormField/FormField';
import { Icon } from '../components/Icon/Icon';
import { Input } from '../components/Input/Input';
import { NavTabs } from '../components/NavTabs/NavTabs';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { Popover } from '../components/Popover/Popover';
import { SegmentedControl } from '../components/SegmentedControl/SegmentedControl';
import { Select } from '../components/Select/Select';
import { Spinner } from '../components/Spinner/Spinner';
import { SystemBanner } from '../components/SystemBanner/SystemBanner';
import { Tabs } from '../components/Tabs/Tabs';
import { ToastProvider, useToast } from '../components/Toast/Toast';
import { Toggle } from '../components/Toggle/Toggle';
import { Tooltip } from '../components/Tooltip/Tooltip';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const ff = 'var(--sv-font-family)';
const ffm = 'var(--sv-font-family-mono)';

function Heading({ level = 2, children }: { level?: 1 | 2 | 3; children: React.ReactNode }) {
  const sizes: Record<number, string> = { 1: '2rem', 2: '1.25rem', 3: '1rem' };
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
        lineHeight: 1.2,
      }}
    >
      {children}
    </Tag>
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
      {subtitle && (
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-sm)',
            color: 'var(--sv-color-text-muted)',
            marginTop: 'var(--sv-space-1)',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      style={{
        fontFamily: ffm,
        fontSize: 'var(--sv-font-size-xs)',
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        padding: 'var(--sv-space-3) var(--sv-space-4)',
        color: 'var(--sv-color-text-primary)',
        overflowX: 'auto',
        margin: 0,
        lineHeight: 1.6,
        whiteSpace: 'pre',
      }}
    >
      {children}
    </pre>
  );
}

function DemoBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-lg)',
        padding: 'var(--sv-space-4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--sv-space-3)',
        flexWrap: 'wrap',
        minHeight: 80,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: ffm,
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.03em',
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        color: 'var(--sv-color-text-muted)',
        borderRadius: 'var(--sv-radius-full)',
        padding: '2px 10px',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Color groups
// ---------------------------------------------------------------------------

const COLOR_GROUPS: Array<{
  label: string;
  usage: string;
  tokens: Array<{ token: string; name: string }>;
}> = [
  {
    label: 'Surface',
    usage: 'Page backgrounds and card elevations.',
    tokens: [
      { token: '--sv-color-surface', name: 'surface' },
      { token: '--sv-color-surface-sunken', name: 'surface-sunken' },
      { token: '--sv-color-surface-raised', name: 'surface-raised' },
    ],
  },
  {
    label: 'Text',
    usage: 'Copy hierarchy from primary body to disabled hints.',
    tokens: [
      { token: '--sv-color-text-primary', name: 'text-primary' },
      { token: '--sv-color-text-muted', name: 'text-muted' },
      { token: '--sv-color-text-subtle', name: 'text-subtle' },
      { token: '--sv-color-text-on-accent', name: 'text-on-accent' },
    ],
  },
  {
    label: 'Border',
    usage: 'Dividers, input outlines, and card edges.',
    tokens: [
      { token: '--sv-color-border', name: 'border' },
      { token: '--sv-color-border-strong', name: 'border-strong' },
    ],
  },
  {
    label: 'Accent',
    usage:
      'Primary interactive color. Monochrome by default; instance admins override with their brand color.',
    tokens: [
      { token: '--sv-color-accent', name: 'accent' },
      { token: '--sv-color-accent-hover', name: 'accent-hover' },
      { token: '--sv-color-focus-ring', name: 'focus-ring' },
    ],
  },
  {
    label: 'Error',
    usage: 'Destructive states, form validation errors, critical banners.',
    tokens: [
      { token: '--sv-color-error-surface', name: 'error-surface' },
      { token: '--sv-color-error-text', name: 'error-text' },
      { token: '--sv-color-error-border', name: 'error-border' },
    ],
  },
  {
    label: 'Warning',
    usage: 'Caution states, expiring licenses, near-limit notices.',
    tokens: [
      { token: '--sv-color-warning-surface', name: 'warning-surface' },
      { token: '--sv-color-warning-text', name: 'warning-text' },
      { token: '--sv-color-warning-border', name: 'warning-border' },
    ],
  },
  {
    label: 'Success',
    usage: 'Positive confirmations, completed actions, healthy status.',
    tokens: [
      { token: '--sv-color-success-surface', name: 'success-surface' },
      { token: '--sv-color-success-text', name: 'success-text' },
      { token: '--sv-color-success-border', name: 'success-border' },
    ],
  },
  {
    label: 'Info',
    usage: 'Informational notices and neutral callouts.',
    tokens: [
      { token: '--sv-color-info-surface', name: 'info-surface' },
      { token: '--sv-color-info-text', name: 'info-text' },
      { token: '--sv-color-info-border', name: 'info-border' },
    ],
  },
];

function ColorSwatch({ token, name }: { token: string; name: string }) {
  const value =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(token).trim()
      : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 160px' }}>
      <div
        style={{
          height: 44,
          borderRadius: 'var(--sv-radius-md)',
          background: `var(${token})`,
          border: '1px solid var(--sv-color-border)',
        }}
      />
      <div>
        <p
          style={{
            fontFamily: ffm,
            fontSize: '0.6875rem',
            color: 'var(--sv-color-text-primary)',
            margin: 0,
          }}
        >
          --sv-color-{name}
        </p>
        <p
          style={{
            fontFamily: ffm,
            fontSize: '0.6875rem',
            color: 'var(--sv-color-text-muted)',
            margin: 0,
          }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ColorGroup({
  label,
  usage,
  tokens,
}: {
  label: string;
  usage: string;
  tokens: Array<{ token: string; name: string }>;
}) {
  return (
    <div style={{ marginBottom: 'var(--sv-space-8)' }}>
      <div style={{ marginBottom: 'var(--sv-space-3)' }}>
        <Heading level={3}>{label}</Heading>
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-caption)',
            color: 'var(--sv-color-text-muted)',
            margin: '4px 0 0',
          }}
        >
          {usage}
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sv-space-4)' }}>
        {tokens.map((t) => (
          <ColorSwatch key={t.token} token={t.token} name={t.name} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const TYPE_SCALE: Array<{ token: string; label: string; note: string }> = [
  { token: '--sv-font-size-2xl', label: '2xl — 24px', note: 'Page titles' },
  { token: '--sv-font-size-xl', label: 'xl — 20px', note: 'Section headings' },
  { token: '--sv-font-size-lg', label: 'lg — 18px', note: 'Sub-headings' },
  { token: '--sv-font-size-md', label: 'md — 16px', note: 'Body (base)' },
  { token: '--sv-font-size-sm', label: 'sm — 14px', note: 'Body copy, labels' },
  { token: '--sv-font-size-caption', label: 'caption — 13px', note: 'Secondary / supporting copy' },
  { token: '--sv-font-size-xs', label: 'xs — 12px', note: 'Mono identifiers, badges' },
  { token: '--sv-font-size-label', label: 'label — 11px', note: 'All-caps section labels' },
];

// ---------------------------------------------------------------------------
// Component cards
// ---------------------------------------------------------------------------

function ComponentCard({
  name,
  importLine,
  usage,
  children,
}: {
  name: string;
  importLine: string;
  usage: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-xl)',
        overflow: 'hidden',
        background: 'var(--sv-color-surface)',
        boxShadow: 'var(--sv-shadow-card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--sv-space-4)',
          borderBottom: '1px solid var(--sv-color-border)',
          background: 'var(--sv-color-surface-sunken)',
        }}
      >
        <Heading level={3}>{name}</Heading>
        <p
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-caption)',
            color: 'var(--sv-color-text-muted)',
            margin: '4px 0 0',
          }}
        >
          {usage}
        </p>
      </div>
      {/* Demo */}
      <div
        style={{
          padding: 'var(--sv-space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 96,
          gap: 'var(--sv-space-3)',
          flexWrap: 'wrap',
          flexGrow: 1,
        }}
      >
        {children}
      </div>
      {/* Import */}
      <div style={{ padding: 'var(--sv-space-3) var(--sv-space-4)' }}>
        <code
          style={{
            fontFamily: ffm,
            fontSize: '0.6875rem',
            color: 'var(--sv-color-text-muted)',
            display: 'block',
          }}
        >
          {importLine}
        </code>
      </div>
    </div>
  );
}

// Interactive wrappers

function ToggleDemo() {
  const [on, setOn] = useState(false);
  return <Toggle checked={on} onChange={setOn} aria-label="Enable feature" />;
}

function SegmentedDemo() {
  const [v, setV] = useState<'user' | 'admin'>('user');
  return (
    <SegmentedControl
      value={v}
      onChange={setV}
      options={[
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ]}
      aria-label="Role"
    />
  );
}

function TabsDemo() {
  const [tab, setTab] = useState('profile');
  return (
    <div style={{ width: '100%', fontFamily: ff }}>
      <Tabs
        items={[
          { label: 'Profile', value: 'profile' },
          { label: 'Security', value: 'security' },
          { label: 'Data', value: 'data' },
        ]}
        value={tab}
        onChange={setTab}
        aria-label="Account"
      />
    </div>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" aria-label="Example dialog">
        <div style={{ padding: 24, fontFamily: ff }}>
          <Heading level={3}>Confirm action</Heading>
          <p
            style={{
              color: 'var(--sv-color-text-muted)',
              fontSize: 'var(--sv-font-size-sm)',
              margin: '12px 0 20px',
            }}
          >
            This will permanently delete the item. Are you sure?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="destructive" size="sm" onClick={() => setOpen(false)}>
              Delete
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
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
      <Drawer open={open} onClose={() => setOpen(false)} aria-label="Navigation">
        <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
          {(['Home', 'Settings', 'Account'] as const).map((item) => (
            <li key={item}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 15,
                  textAlign: 'left',
                  color: 'var(--sv-color-text-primary)',
                  fontFamily: ff,
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}

function PopoverDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      aria-label="Options menu"
      trigger={
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Icon name="settings" size="sm" aria-hidden /> Options
        </Button>
      }
    >
      <div style={{ padding: 'var(--sv-space-3)', fontFamily: ff }}>
        {['Edit', 'Duplicate', 'Delete'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--sv-font-size-sm)',
              textAlign: 'left',
              color:
                item === 'Delete' ? 'var(--sv-color-error-text)' : 'var(--sv-color-text-primary)',
              fontFamily: ff,
              borderRadius: 'var(--sv-radius-sm)',
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() =>
        show({
          title: 'Plugin installed',
          message: 'Tasks v1.2.0 is now active.',
          category: 'success',
        })
      }
    >
      Fire toast
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function OverviewPage() {
  return (
    <div
      style={{
        fontFamily: ff,
        background: 'var(--sv-color-surface)',
        minHeight: '100vh',
        color: 'var(--sv-color-text-primary)',
      }}
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: 'var(--sv-space-10) var(--sv-space-8)',
          borderBottom: '1px solid var(--sv-color-border)',
          background: 'var(--sv-color-surface-sunken)',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sv-space-3)',
              marginBottom: 'var(--sv-space-4)',
            }}
          >
            <Pill>@sovereignfs/ui</Pill>
            <Pill>v1.x</Pill>
          </div>
          <Heading level={1}>Sovereign Design System</Heading>
          <p
            style={{
              fontSize: 'var(--sv-font-size-lg)',
              color: 'var(--sv-color-text-muted)',
              marginTop: 'var(--sv-space-3)',
              maxWidth: 600,
              lineHeight: 1.5,
            }}
          >
            The component library and token system for building Sovereign plugins. Everything here
            is the public contract — available to every plugin developer, stable across minor
            versions.
          </p>
          <div
            style={{
              marginTop: 'var(--sv-space-5)',
              padding: 'var(--sv-space-4)',
              background: 'var(--sv-color-surface)',
              border: '1px solid var(--sv-color-border)',
              borderRadius: 'var(--sv-radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sv-space-2)',
            }}
          >
            <p
              style={{
                fontFamily: ffm,
                fontSize: 'var(--sv-font-size-xs)',
                color: 'var(--sv-color-text-muted)',
                margin: 0,
              }}
            >
              Three things to remember:
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: 'var(--sv-space-5)',
                color: 'var(--sv-color-text-primary)',
                fontSize: 'var(--sv-font-size-sm)',
                lineHeight: 1.8,
              }}
            >
              <li>
                Import components from <code style={{ fontFamily: ffm }}>@sovereignfs/ui</code>
              </li>
              <li>
                Use <code style={{ fontFamily: ffm }}>--sv-*</code> semantic tokens in your CSS —
                they are injected globally by the runtime shell, no import needed
              </li>
              <li>Never hardcode hex values or reference primitive tokens directly</li>
            </ul>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--sv-space-8)' }}>
        {/* ── Quick Start ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Quick start"
            subtitle="Everything you need to build a Sovereign plugin UI."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-4)' }}>
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Import typed React components:
              </p>
              <Code>{`import { Button, Badge, Input, Icon, Toggle, Tabs } from '@sovereignfs/ui';`}</Code>
            </div>
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Reference semantic tokens directly in plugin CSS — no import required:
              </p>
              <Code>{`.my-card {
  background: var(--sv-color-surface);
  border: 1px solid var(--sv-color-border);
  border-radius: var(--sv-radius-lg);
  padding: var(--sv-space-4);
  box-shadow: var(--sv-shadow-card);
  font-family: var(--sv-font-family);
  color: var(--sv-color-text-primary);
}`}</Code>
            </div>
          </div>
        </section>

        {/* ── Token Architecture ────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Token architecture"
            subtitle="Two layers — only the semantic layer is a public API."
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr auto 1fr',
              gap: 'var(--sv-space-3)',
              alignItems: 'center',
              marginBottom: 'var(--sv-space-6)',
            }}
          >
            {[
              {
                label: 'Primitives',
                sub: '--sv-grey-900\n--sv-red-100\n--sv-space-4',
                note: 'Internal only. Raw scale values.',
                muted: true,
              },
            ].map((b) => (
              <div
                key={b.label}
                style={{
                  border: `1px solid ${b.muted ? 'var(--sv-color-border)' : 'var(--sv-color-accent)'}`,
                  borderRadius: 'var(--sv-radius-lg)',
                  padding: 'var(--sv-space-4)',
                  opacity: b.muted ? 0.6 : 1,
                }}
              >
                <p
                  style={{
                    fontSize: 'var(--sv-font-size-sm)',
                    fontWeight: 600,
                    margin: '0 0 6px',
                    color: 'var(--sv-color-text-primary)',
                  }}
                >
                  {b.label}
                </p>
                <pre
                  style={{
                    fontFamily: ffm,
                    fontSize: '0.6875rem',
                    color: 'var(--sv-color-text-muted)',
                    margin: 0,
                    whiteSpace: 'pre',
                  }}
                >
                  {b.sub}
                </pre>
                <p
                  style={{
                    fontSize: 'var(--sv-font-size-caption)',
                    color: 'var(--sv-color-text-muted)',
                    margin: '8px 0 0',
                  }}
                >
                  {b.note}
                </p>
              </div>
            ))}
            <div style={{ textAlign: 'center', color: 'var(--sv-color-text-muted)', fontSize: 24 }}>
              →
            </div>
            <div
              style={{
                border: '2px solid var(--sv-color-accent)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--sv-font-size-sm)',
                  fontWeight: 600,
                  margin: '0 0 6px',
                  color: 'var(--sv-color-text-primary)',
                }}
              >
                Semantic tokens ✓
              </p>
              <pre
                style={{
                  fontFamily: ffm,
                  fontSize: '0.6875rem',
                  color: 'var(--sv-color-text-muted)',
                  margin: 0,
                  whiteSpace: 'pre',
                }}
              >
                {'--sv-color-surface\n--sv-color-error-text\n--sv-radius-lg'}
              </pre>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '8px 0 0',
                }}
              >
                Plugin public API. Theme-aware.
              </p>
            </div>
            <div style={{ textAlign: 'center', color: 'var(--sv-color-text-muted)', fontSize: 24 }}>
              →
            </div>
            <div
              style={{
                border: '2px solid var(--sv-color-accent)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontSize: 'var(--sv-font-size-sm)',
                  fontWeight: 600,
                  margin: '0 0 6px',
                  color: 'var(--sv-color-text-primary)',
                }}
              >
                Components ✓
              </p>
              <pre
                style={{
                  fontFamily: ffm,
                  fontSize: '0.6875rem',
                  color: 'var(--sv-color-text-muted)',
                  margin: 0,
                  whiteSpace: 'pre',
                }}
              >
                {'<Button />\n<Badge />\n<Input />'}
              </pre>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '8px 0 0',
                }}
              >
                React, typed, RSC-safe.
              </p>
            </div>
          </div>
          <div
            style={{
              background: 'var(--sv-color-warning-surface)',
              border: '1px solid var(--sv-color-warning-border)',
              borderRadius: 'var(--sv-radius-md)',
              padding: 'var(--sv-space-3) var(--sv-space-4)',
              fontSize: 'var(--sv-font-size-sm)',
              color: 'var(--sv-color-warning-text)',
            }}
          >
            <strong>Never use primitive tokens in plugin code.</strong> Primitives like{' '}
            <code style={{ fontFamily: ffm }}>--sv-grey-900</code> or{' '}
            <code style={{ fontFamily: ffm }}>--sv-red-100</code> are fixed values — they do not
            swap with dark mode or instance theming. Only semantic tokens do.
          </div>
        </section>

        {/* ── Color System ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Color system"
            subtitle="Semantic groups — use the Themes toolbar above to compare light and dark."
          />
          {COLOR_GROUPS.map((g) => (
            <ColorGroup key={g.label} label={g.label} usage={g.usage} tokens={g.tokens} />
          ))}
        </section>

        {/* ── Typography ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Typography"
            subtitle="Hanken Grotesk (body) · JetBrains Mono (code) — fallback stacks apply when web fonts are not loaded."
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--sv-space-6)',
              marginBottom: 'var(--sv-space-6)',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Body — var(--sv-font-family)
              </p>
              <p
                style={{
                  fontFamily: ff,
                  fontSize: 'var(--sv-font-size-lg)',
                  color: 'var(--sv-color-text-primary)',
                  margin: 0,
                }}
              >
                The quick brown fox
              </p>
              <p
                style={{
                  fontFamily: ff,
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '4px 0 0',
                }}
              >
                ABCDEFGHIJKLMNOPQRSTUVWXYZ
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-2)',
                }}
              >
                Mono — var(--sv-font-family-mono)
              </p>
              <p
                style={{
                  fontFamily: ffm,
                  fontSize: 'var(--sv-font-size-lg)',
                  color: 'var(--sv-color-text-primary)',
                  margin: 0,
                }}
              >
                const x = 42;
              </p>
              <p
                style={{
                  fontFamily: ffm,
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-muted)',
                  margin: '4px 0 0',
                }}
              >
                --sv-font-family-mono
              </p>
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--sv-color-border)',
              borderRadius: 'var(--sv-radius-lg)',
              overflow: 'hidden',
            }}
          >
            {TYPE_SCALE.map((t, i) => (
              <div
                key={t.token}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--sv-space-4)',
                  padding: 'var(--sv-space-3) var(--sv-space-4)',
                  borderBottom:
                    i < TYPE_SCALE.length - 1 ? '1px solid var(--sv-color-border)' : 'none',
                  background:
                    i % 2 === 0 ? 'var(--sv-color-surface)' : 'var(--sv-color-surface-sunken)',
                }}
              >
                <span
                  style={{
                    fontSize: `var(${t.token})`,
                    color: 'var(--sv-color-text-primary)',
                    lineHeight: 1.2,
                    minWidth: 160,
                  }}
                >
                  {t.label}
                </span>
                <code
                  style={{
                    fontFamily: ffm,
                    fontSize: '0.6875rem',
                    color: 'var(--sv-color-text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {t.token}
                </code>
                <span
                  style={{
                    fontSize: 'var(--sv-font-size-caption)',
                    color: 'var(--sv-color-text-muted)',
                    marginLeft: 'auto',
                  }}
                >
                  {t.note}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'var(--sv-space-4)' }}>
            <p
              style={{
                fontSize: 'var(--sv-font-size-caption)',
                color: 'var(--sv-color-text-muted)',
                marginBottom: 'var(--sv-space-2)',
              }}
            >
              Font weight tokens:
            </p>
            <Code>{`font-weight: var(--sv-font-weight-regular);   /* 400 */
font-weight: var(--sv-font-weight-medium);    /* 500 */
font-weight: var(--sv-font-weight-semibold);  /* 600 */
font-weight: var(--sv-font-weight-bold);      /* 700 */`}</Code>
          </div>
        </section>

        {/* ── Spacing & Radius ─────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader title="Spacing & radius" subtitle="4px base grid." />
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sv-space-8)' }}
          >
            {/* Spacing */}
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-3)',
                }}
              >
                Spacing (--sv-space-*)
              </p>
              {(
                [
                  '--sv-space-1',
                  '--sv-space-2',
                  '--sv-space-3',
                  '--sv-space-4',
                  '--sv-space-5',
                  '--sv-space-6',
                  '--sv-space-8',
                  '--sv-space-10',
                  '--sv-space-12',
                  '--sv-space-16',
                ] as const
              ).map((t) => (
                <div
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                  <div
                    style={{
                      width: `var(${t})`,
                      minWidth: 4,
                      height: 10,
                      background: 'var(--sv-color-accent)',
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  />
                  <code
                    style={{
                      fontFamily: ffm,
                      fontSize: '0.6875rem',
                      color: 'var(--sv-color-text-muted)',
                    }}
                  >
                    {t}
                  </code>
                </div>
              ))}
            </div>
            {/* Radius */}
            <div>
              <p
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                  marginBottom: 'var(--sv-space-3)',
                }}
              >
                Border radius (--sv-radius-*)
              </p>
              {(
                [
                  '--sv-radius-sm',
                  '--sv-radius-md',
                  '--sv-radius-lg',
                  '--sv-radius-xl',
                  '--sv-radius-2xl',
                  '--sv-radius-3xl',
                  '--sv-radius-full',
                ] as const
              ).map((t) => (
                <div
                  key={t}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 24,
                      background: 'var(--sv-color-accent)',
                      borderRadius: `var(${t})`,
                      flexShrink: 0,
                    }}
                  />
                  <code
                    style={{
                      fontFamily: ffm,
                      fontSize: '0.6875rem',
                      color: 'var(--sv-color-text-muted)',
                    }}
                  >
                    {t}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Shadows ──────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader title="Elevation & shadows" subtitle="Four levels, dark-mode adjusted." />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 'var(--sv-space-5)',
            }}
          >
            {(
              [
                '--sv-shadow-card',
                '--sv-shadow-hover',
                '--sv-shadow-popover',
                '--sv-shadow-overlay',
              ] as const
            ).map((t) => (
              <div
                key={t}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
              >
                <div
                  style={{
                    width: 64,
                    height: 40,
                    background: 'var(--sv-color-surface-raised)',
                    boxShadow: `var(${t})`,
                    borderRadius: 'var(--sv-radius-md)',
                  }}
                />
                <code
                  style={{
                    fontFamily: ffm,
                    fontSize: '0.6875rem',
                    color: 'var(--sv-color-text-muted)',
                    textAlign: 'center',
                  }}
                >
                  {t.replace('--sv-shadow-', '')}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* ── Component Gallery ─────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Component gallery"
            subtitle="All 13 components — click each story in the sidebar for the full API, variants, and controls."
          />

          <div style={{ marginBottom: 'var(--sv-space-6)' }}>
            <SystemBanner variant="info">
              All components reference <code style={{ fontFamily: ffm }}>--sv-*</code> tokens
              internally — they automatically adapt to dark mode and instance theming without any
              extra configuration.
            </SystemBanner>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 'var(--sv-space-5)',
            }}
          >
            {/* Button */}
            <ComponentCard
              name="Button"
              importLine="import { Button } from '@sovereignfs/ui';"
              usage="Primary interactive control. Four variants: primary, secondary, ghost, destructive. Two sizes: md (default), sm."
            >
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive" size="sm">
                Delete
              </Button>
            </ComponentCard>

            {/* Badge */}
            <ComponentCard
              name="Badge"
              importLine="import { Badge } from '@sovereignfs/ui';"
              usage="Compact label for roles (role), lifecycle states (status), and type/version tags (mono). RSC-safe."
            >
              <Badge variant="role">Admin</Badge>
              <Badge variant="status" status="active">
                Active
              </Badge>
              <Badge variant="status" status="invited">
                Invited
              </Badge>
              <Badge variant="mono">v1.2.0</Badge>
            </ComponentCard>

            {/* Input */}
            <ComponentCard
              name="Input"
              importLine="import { Input } from '@sovereignfs/ui';"
              usage="Primitive text field. No label built-in — always pair with <label> for accessibility. Forwards all native input props."
            >
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Input placeholder="Email address" type="email" style={{ width: '100%' }} />
                <Input placeholder="Disabled" disabled style={{ width: '100%' }} />
              </div>
            </ComponentCard>

            {/* Select */}
            <ComponentCard
              name="Select"
              importLine="import { Select } from '@sovereignfs/ui';"
              usage="Styled native <select> — same visual language as Input. Preserves native picker on mobile. RSC-safe."
            >
              <div style={{ width: '100%' }}>
                <Select defaultValue="admin" style={{ width: '100%' }}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </Select>
              </div>
            </ComponentCard>

            {/* Toggle */}
            <ComponentCard
              name="Toggle"
              importLine="import { Toggle } from '@sovereignfs/ui';"
              usage="38×22px binary switch. Renders as role='switch' for screen reader support. aria-label is required."
            >
              <ToggleDemo />
              <span
                style={{
                  fontFamily: ff,
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-muted)',
                }}
              >
                Click to toggle
              </span>
            </ComponentCard>

            {/* SegmentedControl */}
            <ComponentCard
              name="SegmentedControl"
              importLine="import { SegmentedControl } from '@sovereignfs/ui';"
              usage="Pill-based 2–3 option picker for inline use (role selector, theme switcher). Renders as role='radiogroup'."
            >
              <SegmentedDemo />
            </ComponentCard>

            {/* Tabs */}
            <ComponentCard
              name="Tabs"
              importLine="import { Tabs } from '@sovereignfs/ui';"
              usage="Underline tab nav. Stateless — caller owns value + onChange. Scrolls horizontally on mobile."
            >
              <TabsDemo />
            </ComponentCard>

            {/* Icon */}
            <ComponentCard
              name="Icon"
              importLine="import { Icon } from '@sovereignfs/ui';"
              usage="SVG icon primitive. 29 bundled icons. Decorative: aria-hidden. Meaningful: aria-label. Three sizes: sm, md, lg."
            >
              {(
                [
                  'house',
                  'settings',
                  'bell',
                  'user',
                  'shield',
                  'mail',
                  'search',
                  'plus',
                  'trash-2',
                ] as const
              ).map((n) => (
                <Icon key={n} name={n} size="md" aria-hidden />
              ))}
            </ComponentCard>

            {/* Dialog */}
            <ComponentCard
              name="Dialog"
              importLine="import { Dialog } from '@sovereignfs/ui';"
              usage="Modal surface (scrim + panel). Esc, scrim-click, focus trap. Sizes: sm, md, lg, full. Mobile renders fullscreen."
            >
              <DialogDemo />
            </ComponentCard>

            {/* Drawer */}
            <ComponentCard
              name="Drawer"
              importLine="import { Drawer } from '@sovereignfs/ui';"
              usage="Bottom-sheet panel for mobile navigation. Esc, scrim-click, focus trap. Respects safe-area-inset-bottom."
            >
              <DrawerDemo />
            </ComponentCard>

            {/* Popover */}
            <ComponentCard
              name="Popover"
              importLine="import { Popover } from '@sovereignfs/ui';"
              usage="Floating panel anchored below a trigger. Non-modal. Closes on outside click or Escape. Left or right aligned."
            >
              <PopoverDemo />
            </ComponentCard>

            {/* SystemBanner */}
            <ComponentCard
              name="SystemBanner"
              importLine="import { SystemBanner } from '@sovereignfs/ui';"
              usage="Full-width sticky strip for platform-level notices. Three variants: info, warning, error. Dismissible optional."
            >
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <SystemBanner variant="info">Read-only mode during migration.</SystemBanner>
                <SystemBanner variant="warning">License expires in 7 days.</SystemBanner>
                <SystemBanner variant="error">Maintenance mode active.</SystemBanner>
              </div>
            </ComponentCard>

            {/* Toast */}
            <ComponentCard
              name="Toast"
              importLine="import { ToastProvider, useToast } from '@sovereignfs/ui';"
              usage="Fixed top-right notification stack. Wrap app in ToastProvider; call useToast().show() imperatively. Six categories."
            >
              <ToastProvider>
                <ToastDemo />
              </ToastProvider>
            </ComponentCard>

            {/* Card */}
            <ComponentCard
              name="Card"
              importLine="import { Card } from '@sovereignfs/ui';"
              usage="Surface container with border, shadow, and padding. Use as='article' or 'li' for semantics. Add interactive for hover/focus styles on clickable cards."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                <Card padding="sm">Small padding card</Card>
                <Card padding="md" interactive>
                  Interactive card — hover me
                </Card>
              </div>
            </ComponentCard>

            {/* FormField */}
            <ComponentCard
              name="FormField"
              importLine="import { FormField } from '@sovereignfs/ui';"
              usage="Accessible label + input wrapper. Wires hint and error text to the child via aria-describedby. Always pair with an Input and matching htmlFor/id."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                <FormField label="Email" hint="We'll never share this." htmlFor="ov-email">
                  <Input id="ov-email" type="email" placeholder="you@example.com" />
                </FormField>
                <FormField label="Password" error="Must be 8+ characters." htmlFor="ov-pw">
                  <Input id="ov-pw" type="password" />
                </FormField>
              </div>
            </ComponentCard>

            {/* PageHeader */}
            <ComponentCard
              name="PageHeader"
              importLine="import { PageHeader } from '@sovereignfs/ui';"
              usage="Plugin page top section. Title + optional description + right-side action slot. Replaces the hand-rolled .pageHeader pattern in every plugin."
            >
              <div style={{ width: '100%' }}>
                <PageHeader
                  title="Users"
                  description="Manage who has access to this instance."
                  action={<Button size="sm">Invite user</Button>}
                />
              </div>
            </ComponentCard>

            {/* EmptyState */}
            <ComponentCard
              name="EmptyState"
              importLine="import { EmptyState } from '@sovereignfs/ui';"
              usage="Zero-data placeholder. Icon slot, heading, description, and optional CTA. Use whenever a list or table has no rows."
            >
              <EmptyState
                icon="search"
                heading="No results found"
                description="Try adjusting your search."
                action={
                  <Button variant="secondary" size="sm">
                    Clear filters
                  </Button>
                }
              />
            </ComponentCard>

            {/* Spinner */}
            <ComponentCard
              name="Spinner"
              importLine="import { Spinner } from '@sovereignfs/ui';"
              usage="CSS-animated loading ring in sm/md/lg sizes matching icon-size tokens. Pauses under prefers-reduced-motion. Sets role='status' with aria-label."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </div>
            </ComponentCard>

            {/* Avatar */}
            <ComponentCard
              name="Avatar"
              importLine="import { Avatar } from '@sovereignfs/ui';"
              usage="User representation. Shows image when src loads; falls back to initials derived from name. Three sizes. Always sets alt text for accessibility."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name="Jane Smith" size="sm" />
                <Avatar name="Jane Smith" size="md" />
                <Avatar name="Jane Smith" size="lg" />
                <Avatar name="Admin" src="https://i.pravatar.cc/150?u=sb" size="lg" />
              </div>
            </ComponentCard>

            {/* NavTabs */}
            <ComponentCard
              name="NavTabs"
              importLine="import { NavTabs } from '@sovereignfs/ui';"
              usage="Underline-style navigation tabs for plugin-level page routing. Distinct from the contained Tabs component. Scrolls horizontally on mobile with no visible scrollbar."
            >
              <div style={{ width: '100%' }}>
                <NavTabs
                  items={[
                    { label: 'Profile', href: '#', active: true },
                    { label: 'Security', href: '#' },
                    { label: 'Preferences', href: '#' },
                    { label: 'Data', href: '#' },
                  ]}
                />
              </div>
            </ComponentCard>

            {/* Tooltip */}
            <ComponentCard
              name="Tooltip"
              importLine="import { Tooltip } from '@sovereignfs/ui';"
              usage="CSS-only hover/focus hint. Four placements. Wired to its trigger via aria-describedby. No JS positioning — RSC-safe."
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <Tooltip content="Saved to your account" side="top">
                  <Button variant="secondary" size="sm">
                    Save
                  </Button>
                </Tooltip>
                <Tooltip content="Cannot be undone" side="right">
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                </Tooltip>
              </div>
            </ComponentCard>
          </div>
        </section>

        {/* ── Theming ──────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-12)' }}>
          <SectionHeader
            title="Tenant theming"
            subtitle="The identity is monochrome by default. Tenants add brand color by overriding --sv-color-accent."
          />
          <p
            style={{
              fontSize: 'var(--sv-font-size-sm)',
              color: 'var(--sv-color-text-muted)',
              marginBottom: 'var(--sv-space-4)',
            }}
          >
            Set via the Console → Instance identity section (or the{' '}
            <code style={{ fontFamily: ffm }}>/api/instance/</code> API). Plugin CSS does not need
            to change — all components read{' '}
            <code style={{ fontFamily: ffm }}>--sv-color-accent</code> from the cascade.
          </p>
          <Code>{`/* Operator CSS override — injected by InstanceProvider */
:root {
  --sv-color-accent:        #5c6bc0;  /* brand blue */
  --sv-color-accent-hover:  #3949ab;
  --sv-color-focus-ring:    #5c6bc0;
  --sv-color-text-on-accent: #ffffff; /* must contrast with accent */
}`}</Code>

          <DemoBox style={{ marginTop: 'var(--sv-space-4)' }}>
            <Button style={{ background: '#5c6bc0', borderColor: '#5c6bc0', color: '#fff' }}>
              Themed button
            </Button>
            <span
              style={{
                display: 'inline-block',
                fontFamily: ff,
                fontSize: 'var(--sv-font-size-caption)',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--sv-radius-sm)',
                background: '#e8eaf6',
                color: '#3949ab',
                border: '1px solid #c5cae9',
              }}
            >
              Owner
            </span>
            <span
              style={{
                fontFamily: ff,
                fontSize: 'var(--sv-font-size-caption)',
                color: 'var(--sv-color-text-muted)',
              }}
            >
              Components read the accent token — brand applied everywhere.
            </span>
          </DemoBox>
        </section>

        {/* ── Rules ────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 'var(--sv-space-8)' }}>
          <SectionHeader
            title="Design rules"
            subtitle="The short list of things that break dark mode or instance theming if ignored."
          />
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sv-space-5)' }}
          >
            <div
              style={{
                background: 'var(--sv-color-success-surface)',
                border: '1px solid var(--sv-color-success-border)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  color: 'var(--sv-color-success-text)',
                  marginBottom: 'var(--sv-space-3)',
                  fontSize: 'var(--sv-font-size-sm)',
                }}
              >
                ✓ Do
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 var(--sv-space-4)',
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-primary)',
                  lineHeight: 1.8,
                }}
              >
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-color-*</code> semantic tokens
                </li>
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-space-*</code>,{' '}
                  <code style={{ fontFamily: ffm }}>--sv-radius-*</code> scale tokens
                </li>
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-font-family</code> and{' '}
                  <code style={{ fontFamily: ffm }}>--sv-font-family-mono</code>
                </li>
                <li>
                  Import components from <code style={{ fontFamily: ffm }}>@sovereignfs/ui</code>
                </li>
                <li>
                  Use <code style={{ fontFamily: ffm }}>--sv-shadow-*</code> for elevation
                </li>
              </ul>
            </div>
            <div
              style={{
                background: 'var(--sv-color-error-surface)',
                border: '1px solid var(--sv-color-error-border)',
                borderRadius: 'var(--sv-radius-lg)',
                padding: 'var(--sv-space-4)',
              }}
            >
              <p
                style={{
                  fontWeight: 600,
                  color: 'var(--sv-color-error-text)',
                  marginBottom: 'var(--sv-space-3)',
                  fontSize: 'var(--sv-font-size-sm)',
                }}
              >
                ✗ Don't
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 var(--sv-space-4)',
                  fontSize: 'var(--sv-font-size-sm)',
                  color: 'var(--sv-color-text-primary)',
                  lineHeight: 1.8,
                }}
              >
                <li>
                  Hardcode hex values like <code style={{ fontFamily: ffm }}>#333</code>
                </li>
                <li>
                  Use primitive tokens like <code style={{ fontFamily: ffm }}>--sv-grey-900</code>{' '}
                  directly
                </li>
                <li>Use Tailwind classes or runtime CSS-in-JS</li>
                <li>
                  Import from <code style={{ fontFamily: ffm }}>runtime/src</code> (SDK boundary)
                </li>
                <li>
                  Override <code style={{ fontFamily: ffm }}>--sv-color-accent</code> from plugin
                  CSS
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

const meta = {
  title: 'Overview',
  component: OverviewPage,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Complete reference for plugin developers — components, tokens, theming, and design rules in one page.',
      },
    },
  },
} satisfies Meta<typeof OverviewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DesignSystem: Story = {};
