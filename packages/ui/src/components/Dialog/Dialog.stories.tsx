import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/Button';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { FormField } from '../FormField/FormField';
import { Input } from '../Input/Input';
import { Dialog, type DialogSize } from './Dialog';
import { DialogBody } from './DialogBody';
import { DialogDescription } from './DialogDescription';
import { DialogFooter } from './DialogFooter';
import { DialogHeader } from './DialogHeader';
import { DialogTitle } from './DialogTitle';

// ---------------------------------------------------------------------------
// Shared doc-page primitives (mirrors src/stories/InteractionHooks.stories.tsx's styling)
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
      label: '💡',
    },
  }[type];
  return (
    <div
      style={{
        marginTop: 'var(--sv-space-3)',
        padding: 'var(--sv-space-3) var(--sv-space-4)',
        background: map.bg,
        border: `1px solid ${map.border}`,
        borderRadius: 'var(--sv-radius-md)',
        color: map.text,
        fontFamily: ff,
        fontSize: 'var(--sv-font-size-sm)',
        lineHeight: 1.6,
      }}
    >
      <strong style={{ marginRight: 'var(--sv-space-2)' }}>{map.label}</strong>
      {children}
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

function DemoCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 'var(--sv-space-5)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        background: 'var(--sv-color-surface)',
        display: 'flex',
        gap: 'var(--sv-space-2)',
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive demos
// ---------------------------------------------------------------------------

function ConfirmationDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        Delete list
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete list?"
        message="All tasks in this list will be permanently deleted."
        onConfirm={() => setOpen(false)}
        destructive
      />
    </>
  );
}

const FIXED_SIZES = ['sm', 'md', 'lg', 'full'] as const;

function FixedSizeDemo() {
  const [openSize, setOpenSize] = useState<(typeof FIXED_SIZES)[number] | null>(null);
  return (
    <>
      <DemoCard>
        {FIXED_SIZES.map((size) => (
          <Button key={size} size="sm" variant="secondary" onClick={() => setOpenSize(size)}>
            Open {size}
          </Button>
        ))}
      </DemoCard>
      <Dialog
        open={openSize !== null}
        onClose={() => setOpenSize(null)}
        size={(openSize ?? 'md') as DialogSize}
      >
        <DialogHeader>
          <DialogTitle>{openSize ? `size="${openSize}"` : ''}</DialogTitle>
          <DialogDescription>
            Width (and for sm/md/xl, a max-height cap) comes from the size preset itself — the panel
            still grows and shrinks to its content up to that cap.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p
            style={{
              color: 'var(--sv-color-text-primary)',
              fontSize: 'var(--sv-font-size-sm)',
              margin: 0,
            }}
          >
            This region scrolls independently. The header and footer are fixed ("sticky") — they
            never scroll away, since both are optional flex siblings around the one scrollable body.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpenSize(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => setOpenSize(null)}>
            Save
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function DynamicSizeDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DemoCard>
        <Button size="sm" onClick={() => setOpen(true)}>
          Open size=&quot;auto&quot; dialog
        </Button>
      </DemoCard>
      <Dialog open={open} onClose={() => setOpen(false)} size="auto">
        <DialogHeader>
          <DialogTitle>Quick action</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p
            style={{
              color: 'var(--sv-color-text-primary)',
              fontSize: 'var(--sv-font-size-sm)',
              margin: 0,
            }}
          >
            Just one short line of content — this box sizes itself to fit it, not to a fixed
            sm/md/lg/full preset (still capped so it can&apos;t blow out past a reasonable width or
            the viewport).
          </p>
        </DialogBody>
      </Dialog>
    </>
  );
}

const LONG_PARAGRAPHS = Array.from(
  { length: 8 },
  (_, i) =>
    `Paragraph ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`,
);

function ScrollableContentDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DemoCard>
        <Button size="sm" onClick={() => setOpen(true)}>
          Open scrollable dialog
        </Button>
      </DemoCard>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Terms of service</DialogTitle>
          <DialogDescription>
            Header and footer stay fixed while this body scrolls — scroll down to see.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {LONG_PARAGRAPHS.map((p) => (
            <p
              key={p.slice(0, 12)}
              style={{ color: 'var(--sv-color-text-primary)', fontSize: 'var(--sv-font-size-sm)' }}
            >
              {p}
            </p>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Decline
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Accept
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function HeaderOnlyDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DemoCard>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Open header-only dialog
        </Button>
      </DemoCard>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Announcement</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p
            style={{
              color: 'var(--sv-color-text-primary)',
              fontSize: 'var(--sv-font-size-sm)',
              margin: 0,
            }}
          >
            No <code>DialogFooter</code> here — just a header (so the close button still shows) and
            a body. Not every dialog needs a trailing action row.
          </p>
        </DialogBody>
      </Dialog>
    </>
  );
}

function FooterOnlyDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DemoCard>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Open footer-only dialog
        </Button>
      </DemoCard>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" aria-label="Footer only example">
        <DialogBody>
          <p
            style={{
              color: 'var(--sv-color-text-primary)',
              fontSize: 'var(--sv-font-size-sm)',
              margin: 0,
            }}
          >
            No <code>DialogHeader</code> here, so there&apos;s no close button either (the rule
            follows the header, not the footer) — this footer&apos;s own action is the only way to
            dismiss besides Esc/scrim-click.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function ProfileFormDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DemoCard>
        <Button size="sm" onClick={() => setOpen(true)}>
          Edit profile
        </Button>
      </DemoCard>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <FormField label="Name">
              {(field) => <Input {...field} defaultValue="Pedro Duarte" />}
            </FormField>
            <FormField label="Username">
              {(field) => <Input {...field} defaultValue="@peduarte" />}
            </FormField>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Save changes
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

function DialogDoc() {
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
        <Heading level={1}>Dialog</Heading>
        <Body>
          Three dialog shapes cover every modal need in the platform: a small{' '}
          <strong>Confirmation Dialog</strong> for a yes/no prompt, a <strong>Modal Dialog</strong>{' '}
          at a fixed preset size (sm/md/lg/full), and a <strong>dynamic-size Dialog</strong> (
          <code>size=&quot;auto&quot;</code>) that sizes itself to its content instead of a preset.
        </Body>
        <Callout type="info">
          <strong>Header and Footer are optional</strong>, and when present they&apos;re fixed
          (&quot;sticky&quot;) — they never scroll away, only the body between them does. The
          built-in close button follows the header: it shows automatically once a{' '}
          <code>DialogHeader</code> is composed, and doesn&apos;t render at all without one (Esc and
          scrim-click always still work either way).
        </Callout>
        <Callout type="tip">
          Every demo on this page is a real, interactive <code>Dialog</code>. Switch the{' '}
          <strong>Viewport</strong> toolbar above (top of the canvas) to <strong>Mobile</strong> to
          see any of them become the real full-screen mobile sheet — no separate mobile story
          needed, this one page covers both.
        </Callout>
      </div>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Confirmation Dialog"
          subtitle="A small, content-sized confirm/cancel prompt — built on the native <dialog> element, not Dialog. See ConfirmDialog's own story for every variant (destructive, pending, error)."
        />
        <ConfirmationDemo />
        <CodeBlock>{`<ConfirmDialog
  open={open}
  onClose={() => setOpen(false)}
  title="Delete list?"
  message="All tasks in this list will be permanently deleted."
  onConfirm={handleDelete}
  destructive
/>`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Modal Dialog — fixed sizes"
          subtitle="sm / md / lg / full — sm/md/xl are a fixed width with a content-driven, capped height; lg/full are a true fixed 100%×100% box. Composed from DialogHeader (optional), DialogBody, and DialogFooter (optional)."
        />
        <FixedSizeDemo />
        <CodeBlock>{`<Dialog open={open} onClose={onClose} size="md">
  <DialogHeader>
    <DialogTitle>Edit list</DialogTitle>
    <DialogDescription>Make changes to your list here.</DialogDescription>
  </DialogHeader>
  <DialogBody>...</DialogBody>
  <DialogFooter>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={onSave}>Save</Button>
  </DialogFooter>
</Dialog>`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Dialog — dynamic size"
          subtitle={
            'size="auto" sizes both width and height to content instead of a fixed preset — for a dialog whose size is genuinely driven by what’s inside it (still capped to a sensible ceiling).'
          }
        />
        <DynamicSizeDemo />
        <CodeBlock>{`<Dialog open={open} onClose={onClose} size="auto">
  <DialogHeader>
    <DialogTitle>Quick action</DialogTitle>
  </DialogHeader>
  <DialogBody>...</DialogBody>
</Dialog>`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Scrollable content, header and footer sticky"
          subtitle="Long body content scrolls on its own; DialogHeader and DialogFooter stay fixed at the top and bottom of the panel throughout."
        />
        <ScrollableContentDemo />
        <CodeBlock>{`<Dialog open={open} onClose={onClose} size="sm">
  <DialogHeader>
    <DialogTitle>Terms of service</DialogTitle>
  </DialogHeader>
  <DialogBody>{/* long content */}</DialogBody>
  <DialogFooter>
    <Button variant="secondary" onClick={onClose}>Decline</Button>
    <Button variant="primary" onClick={onAccept}>Accept</Button>
  </DialogFooter>
</Dialog>`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Header only"
          subtitle="DialogFooter is independently optional — a header with no trailing action row is just as valid as a footer with no header."
        />
        <HeaderOnlyDemo />
        <CodeBlock>{`<Dialog open={open} onClose={onClose} size="sm">
  <DialogHeader>
    <DialogTitle>Announcement</DialogTitle>
  </DialogHeader>
  <DialogBody>...</DialogBody>
</Dialog>`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Footer only → no close button"
          subtitle="With no DialogHeader, there's nothing to hang the close button on, so it doesn't render by default — even though a DialogFooter is present. Esc, scrim-click, or the footer's own action are the only ways to dismiss."
        />
        <FooterOnlyDemo />
        <CodeBlock>{`<Dialog open={open} onClose={onClose} size="sm" aria-label="...">
  <DialogBody>...</DialogBody>
  <DialogFooter>
    <Button variant="primary" onClick={onClose}>Got it</Button>
  </DialogFooter>
</Dialog>
// No DialogHeader → no close button, even with a DialogFooter present.
// Pass showCloseButton explicitly to override the default in either direction.`}</CodeBlock>
      </section>

      <section style={{ marginBottom: 'var(--sv-space-10)' }}>
        <SectionHeader
          title="Full composition example"
          subtitle="DialogTitle + DialogDescription in the header, form fields in the body, right-aligned Cancel/Save actions in the footer — everything together in one realistic example."
        />
        <ProfileFormDemo />
        <CodeBlock>{`<Dialog open={open} onClose={onClose} size="sm">
  <DialogHeader>
    <DialogTitle>Edit profile</DialogTitle>
    <DialogDescription>Make changes to your profile here.</DialogDescription>
  </DialogHeader>
  <DialogBody>
    <FormField label="Name">{(field) => <Input {...field} />}</FormField>
  </DialogBody>
  <DialogFooter>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={onSave}>Save changes</Button>
  </DialogFooter>
</Dialog>`}</CodeBlock>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

const meta = {
  title: 'Components/Dialog',
  component: DialogDoc,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal surface (scrim + panel). Three shapes: ConfirmDialog (small confirm/cancel prompt), Dialog at a fixed size (sm/md/lg/full), and Dialog at a dynamic size (auto). DialogHeader/DialogFooter are optional and fixed ("sticky") when present; the close button follows DialogHeader. Switch the Viewport toolbar to Mobile to see any demo as the real full-screen mobile sheet.',
      },
    },
  },
} satisfies Meta<typeof DialogDoc>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
