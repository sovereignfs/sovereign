import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from '../components/Card/Card';
import {
  useCommitOnEnterOrBlur,
  useDoubleTapHandler,
  useIsMobile,
  useLongPress,
  useSingleOrDoubleTap,
} from '../hooks';

// ---------------------------------------------------------------------------
// Shared primitives (mirrors MobilePatterns.stories.tsx's doc styling)
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

function EventLog({ events }: { events: string[] }) {
  return (
    <div
      style={{
        marginTop: 'var(--sv-space-3)',
        fontFamily: 'var(--sv-font-family-mono)',
        fontSize: '0.75rem',
        color: 'var(--sv-color-text-muted)',
        background: 'var(--sv-color-surface-sunken)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        padding: 'var(--sv-space-2) var(--sv-space-3)',
        minHeight: '2.5em',
      }}
    >
      {events.length === 0 ? '(no events yet)' : events.slice(-5).join('\n')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive demos
// ---------------------------------------------------------------------------

function LongPressDemo() {
  const [events, setEvents] = useState<string[]>([]);
  const log = (msg: string) =>
    setEvents((e) => [...e, `${new Date().toLocaleTimeString()} — ${msg}`]);
  const longPress = useLongPress({ onLongPress: () => log('onLongPress fired') });

  return (
    <div>
      <div
        {...longPress}
        style={{
          ...longPress.style,
          padding: 'var(--sv-space-5)',
          borderRadius: 'var(--sv-radius-md)',
          border: '1px dashed var(--sv-color-border-strong)',
          background: 'var(--sv-color-surface)',
          textAlign: 'center',
          fontFamily: ff,
          fontSize: 'var(--sv-font-size-sm)',
          color: 'var(--sv-color-text-muted)',
          cursor: 'default',
        }}
      >
        Touch and hold (real touch input only — see note below)
      </div>
      <EventLog events={events} />
      <Callout type="info">
        The hook only arms for <code>pointerType === &apos;touch&apos;</code> — a desktop mouse
        click never starts the timer, so mouse text-selection is never disabled. Test this on a real
        touch device or with devtools&apos; device toolbar (which synthesizes real touch pointer
        events), not a plain mouse click in this preview.
      </Callout>
    </div>
  );
}

function DoubleTapDemo() {
  const [events, setEvents] = useState<string[]>([]);
  const log = (msg: string) =>
    setEvents((e) => [...e, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const handleSwatchTap = useDoubleTapHandler<React.MouseEvent>(() => log('double-tap: swatch'));
  const handleTitleTap = useSingleOrDoubleTap<React.MouseEvent>(
    () => log('single tap: would navigate'),
    () => log('double-tap: would rename'),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--sv-space-3)', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleSwatchTap}
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--sv-radius-full)',
            background: 'var(--sv-color-accent)',
            border: 'none',
            cursor: 'pointer',
          }}
          aria-label="Double-tap demo swatch"
        />
        <span
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-sm)',
            color: 'var(--sv-color-text-muted)',
          }}
        >
          useDoubleTapHandler — nothing to preempt, double-click/double-tap fires immediately
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--sv-space-3)', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleTitleTap}
          style={{
            padding: 'var(--sv-space-2) var(--sv-space-4)',
            borderRadius: 'var(--sv-radius-md)',
            background: 'var(--sv-color-surface-sunken)',
            border: '1px solid var(--sv-color-border)',
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-sm)',
            cursor: 'pointer',
          }}
        >
          List title
        </button>
        <span
          style={{
            fontFamily: ff,
            fontSize: 'var(--sv-font-size-sm)',
            color: 'var(--sv-color-text-muted)',
          }}
        >
          useSingleOrDoubleTap — single tap deferred ~350ms so a double can preempt it
        </span>
      </div>
      <EventLog events={events} />
    </div>
  );
}

function CommitOnEnterOrBlurDemo() {
  const [value, setValue] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const log = (msg: string) =>
    setEvents((e) => [...e, `${new Date().toLocaleTimeString()} — ${msg}`]);
  const commitHandlers = useCommitOnEnterOrBlur(() => log(`commit: "${value}"`));

  return (
    <div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        {...commitHandlers}
        placeholder="Type, then press Enter or click away…"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: 'var(--sv-space-2) var(--sv-space-3)',
          borderRadius: 'var(--sv-radius-md)',
          border: '1px solid var(--sv-color-border-strong)',
          background: 'var(--sv-color-surface)',
          color: 'var(--sv-color-text-primary)',
          fontFamily: ff,
          fontSize: 'var(--sv-font-size-sm)',
        }}
      />
      <EventLog events={events} />
      <Callout type="info">
        Tries to reproduce the bug this hook fixes: on iOS, tap into the field, type something, then
        dismiss the keyboard via the native Done/checkmark toolbar instead of the Return key — both
        now log a commit here, where an Enter-only handler would silently drop the checkmark path.
      </Callout>
    </div>
  );
}

function IsMobileDemo() {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        padding: 'var(--sv-space-4)',
        borderRadius: 'var(--sv-radius-md)',
        background: isMobile ? 'var(--sv-color-success-surface)' : 'var(--sv-color-info-surface)',
        color: isMobile ? 'var(--sv-color-success-text)' : 'var(--sv-color-info-text)',
        fontFamily: ff,
        fontSize: 'var(--sv-font-size-sm)',
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      useIsMobile() → {String(isMobile)} — resize the preview or switch the viewport toolbar to see
      this flip at 768px.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main story component
// ---------------------------------------------------------------------------

function InteractionHooksDoc() {
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
        <Heading level={1}>Interaction Hooks</Heading>
        <Body>
          Touch gesture handling, carried once in the design system so no plugin has to rediscover
          the failure modes. Per the DS-first principle, build gesture handling here — not in a
          plugin. See{' '}
          <code style={{ fontFamily: 'var(--sv-font-family-mono)', fontSize: '0.8em' }}>
            docs/design-system.md
          </code>{' '}
          for the full written reference.
        </Body>
      </div>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="useLongPress"
          subtitle="Touch-and-hold with movement tolerance, pointercancel handling, OS-callout suppression, and time-boxed click suppression."
        />
        <Card padding="md">
          <LongPressDemo />
        </Card>
        <CodeBlock>{`const longPress = useLongPress({ onLongPress: () => setBulkMode(true) });
<div {...longPress}>Hold to select</div>`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="useDoubleTapHandler / useSingleOrDoubleTap"
          subtitle="Desktop double-click reports e.detail === 2 natively; touch needs timing-based detection instead."
        />
        <Card padding="md">
          <DoubleTapDemo />
        </Card>
        <Callout type="tip">
          Use <code style={{ fontFamily: 'var(--sv-font-family-mono)' }}>useDoubleTapHandler</code>{' '}
          when the single tap has nothing to cancel. Use{' '}
          <code style={{ fontFamily: 'var(--sv-font-family-mono)' }}>useSingleOrDoubleTap</code>{' '}
          only when the single tap has a default action (e.g. navigation) a following double-tap
          must be able to preempt — every single tap through it pays the ~350ms wait.
        </Callout>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="useCommitOnEnterOrBlur"
          subtitle="Unifies Enter-to-commit with iOS's native keyboard accessory toolbar, whose Done/checkmark only ever fires a blur, never a keydown."
        />
        <Card padding="md">
          <CommitOnEnterOrBlurDemo />
        </Card>
        <CodeBlock>{`const commitHandlers = useCommitOnEnterOrBlur(() => createTask(title));
<input value={title} onChange={...} {...commitHandlers} />`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="useIsMobile"
          subtitle="SSR-safe viewport check against the platform's single documented breakpoint (768px)."
        />
        <Card padding="md">
          <IsMobileDemo />
        </Card>
        <CodeBlock>{`import { useIsMobile, MOBILE_BREAKPOINT_PX } from '@sovereignfs/ui';

const isMobile = useIsMobile(); // defaults to MOBILE_BREAKPOINT_PX (768)`}</CodeBlock>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

const meta = {
  title: 'Overview/Interaction Hooks',
  component: InteractionHooksDoc,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Reference and live demos for the touch-gesture hooks exported from @sovereignfs/ui. Long-press requires real touch input to trigger — use the devtools device toolbar or a physical device.',
      },
    },
  },
} satisfies Meta<typeof InteractionHooksDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MobileView: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
