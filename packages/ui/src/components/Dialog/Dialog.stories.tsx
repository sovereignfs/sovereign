import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { Dialog, useOverlaySecondRow } from './Dialog';

// Controlled wrapper so the play function can open/inspect the dialog.
function DialogDemo({
  size = 'lg',
  label = 'Example dialog',
}: {
  size?: 'sm' | 'md' | 'lg' | 'auto' | 'fixed';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open {size} dialog</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size={size} aria-label={label}>
        <div style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--sv-color-text-primary)',
              marginBottom: 12,
            }}
          >
            {label}
          </h2>
          <p style={{ color: 'var(--sv-color-text-muted)', marginBottom: 24 }}>
            This is a <strong>{size}</strong> dialog. Press Esc or click the scrim to dismiss.
          </p>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Dialog>
    </>
  );
}

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Modal surface (scrim + panel). Router-agnostic — caller provides `onClose`. Supports Esc, scrim-click, focus trap and focus restoration. Sizes: `sm` / `md` / `lg` / `auto` / `fixed`. `sm`/`md` are fixed-width, content-driven height; `auto` is content-driven on both width and height; `lg` is a true fixed 100%/100% box; `fixed` is also a true fixed box (width and height both set, content never resizes it) but capped at 64rem×44rem rather than filling the viewport. Mobile always renders as a full-screen sheet. Three composition shapes via the optional `header`/`footer` props: Body only (both omitted, the default), Header + Body, Header + Body + Footer — see the stories below the size examples.',
      },
    },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Small: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="sm" label="Small dialog" />,
};

export const Medium: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="md" label="Medium dialog" />,
};

export const Large: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="lg" label="Large dialog" />,
};

/**
 * `fixed` is a true fixed box like `lg` (width AND height both set — content
 * never resizes it) but capped at 64rem×44rem rather than filling the
 * viewport. Added for epic task 14.5 (Account's vertical nav): a plugin
 * whose route tree includes a client-side redirect through a near-empty
 * intermediate page needs a size that won't visibly shrink to fit that empty
 * page and then grow once real content lands — every other size is
 * content-driven on at least one axis and would do exactly that.
 */
export const Fixed: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="fixed" label="Fixed dialog" />,
};

/**
 * `auto` sizes to content on both width and height, unlike `sm`/`md` (fixed
 * width, content-driven height only) — capped, not fixed, on either axis.
 * This demo's own content is deliberately narrower than `md`'s 36rem, so the
 * panel visibly shrinks below it — a fixed-width size can't do that.
 */
export const AutoSize: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open auto-sized dialog</Button>
          <Dialog open={open} onClose={() => setOpen(false)} size="auto" aria-label="Delete item?">
            <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: '18rem' }}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--sv-color-text-primary)',
                  marginBottom: 12,
                }}
              >
                Delete item?
              </h2>
              <p style={{ color: 'var(--sv-color-text-muted)', marginBottom: 24 }}>
                This panel is narrower than `md`'s fixed 36rem — `auto` shrank to fit this short
                message instead of padding out a fixed width.
              </p>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </Dialog>
        </>
      );
    }
    return <Demo />;
  },
};

export const Closed: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => (
    <Dialog open={false} onClose={() => {}} aria-label="Closed dialog">
      <p>Never seen</p>
    </Dialog>
  ),
};

/** Play function opens the dialog and asserts it is visible. */
export const OpenViaInteraction: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => <DialogDemo size="md" label="Interaction test dialog" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /open md dialog/i });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole('dialog');
    await expect(dialog).toBeVisible();
  },
};

// A stand-in for a plugin's own route layout — several component layers below
// wherever <Dialog> itself is instantiated, exactly like the real
// AccountLayout/ConsoleLayout usage this hook was built for.
function NestedTabStrip() {
  const insideOverlay = useOverlaySecondRow(
    <div style={{ display: 'flex', gap: 16, padding: '0 16px' }}>
      {['Profile', 'Security', 'Preferences'].map((tab) => (
        <span key={tab} style={{ fontSize: 14, color: 'var(--sv-color-text-primary)' }}>
          {tab}
        </span>
      ))}
    </div>,
  );
  return (
    <p style={{ color: 'var(--sv-color-text-muted)', fontSize: 13 }}>
      useOverlaySecondRow found a Dialog ancestor: <strong>{String(insideOverlay)}</strong>. Switch
      the viewport toolbar to a mobile width to see the tab strip render inside the Dialog's own
      mobile OverlayHeader instead of here.
    </p>
  );
}

/**
 * Demonstrates useOverlaySecondRow — solves the "double header" problem for
 * overlay-shell plugins (Console, Account): a deeply-nested layout hands its
 * tab strip up to the enclosing Dialog's mobile OverlayHeader instead of
 * rendering a second header bar as ordinary content. Only visible at mobile
 * widths, where Dialog's own OverlayHeader takes over; at desktop widths the
 * secondRow prop has no visible effect (OverlayHeader is desktop-hidden).
 */
export const WithOverlaySecondRow: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open dialog with tab strip</Button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Account" aria-label="Account">
            <div style={{ padding: 24, fontFamily: 'system-ui' }}>
              <NestedTabStrip />
            </div>
          </Dialog>
        </>
      );
    }
    return <Demo />;
  },
};

// ---------------------------------------------------------------------------
// Composition shapes (header/footer props) — Body only is every story above
// this point (both props omitted); these three demonstrate the other two.

/**
 * "Body only" — the default shape (both `header` and `footer` omitted).
 * Included explicitly alongside the size stories above as the baseline the
 * other two composition shapes are compared against: no visible header on
 * desktop, a floating close button instead, and any actions live inside the
 * scrollable body.
 */
export const BodyOnly: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open body-only dialog</Button>
          <Dialog open={open} onClose={() => setOpen(false)} size="sm" aria-label="Body only">
            <div style={{ padding: 24, fontFamily: 'system-ui' }}>
              <p style={{ color: 'var(--sv-color-text-muted)' }}>
                No `header` or `footer` prop — today's default. Desktop shows only the floating
                close button; actions (if any) live in this scrolling body, same as before this
                task.
              </p>
            </div>
          </Dialog>
        </>
      );
    }
    return <Demo />;
  },
};

/**
 * "Header + Body" — the `header` prop renders a persistent title/close row
 * on both desktop and mobile (unlike the plain `title` prop, which is
 * mobile-only). Resize the viewport to confirm the header stays visible and
 * identically styled at both widths.
 */
export const HeaderAndBody: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open header + body dialog</Button>
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            size="sm"
            header="Card detail"
            aria-label="Card detail"
          >
            <div style={{ padding: 24, fontFamily: 'system-ui' }}>
              <p style={{ color: 'var(--sv-color-text-muted)' }}>
                The "Card detail" title above is the `header` prop, rendered via the same shared
                header row on both desktop and mobile — resize the viewport to confirm it doesn't
                disappear on desktop the way a plain `title` would.
              </p>
            </div>
          </Dialog>
        </>
      );
    }
    return <Demo />;
  },
};

/**
 * "Header + Body + Footer" — both `header` and `footer` are pinned flex
 * siblings around `.content`; only the body between them scrolls. The body
 * here is long enough to actually scroll, so header/footer staying put is
 * visible, not just theoretical — check this at both a desktop and a
 * ≤768px viewport per this task's own review checklist.
 */
export const HeaderBodyFooter: Story = {
  args: { open: false, onClose: () => {}, children: null },
  render: (_args) => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open header + body + footer dialog</Button>
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            size="sm"
            header="Edit card"
            footer={
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setOpen(false)}>Save</Button>
              </div>
            }
            aria-label="Edit card"
          >
            <div style={{ padding: 24, fontFamily: 'system-ui', display: 'grid', gap: 16 }}>
              <p style={{ color: 'var(--sv-color-text-muted)' }}>
                Scroll this body — the "Edit card" header above and the Cancel/Save footer below
                both stay pinned; only this region between them moves.
              </p>
              {Array.from({ length: 12 }, (_, i) => (
                <p key={i} style={{ color: 'var(--sv-color-text-muted)' }}>
                  Field {i + 1} of 12 — filler content long enough to force `.content` to actually
                  scroll, so the pinned header/footer behavior is visible rather than theoretical.
                </p>
              ))}
            </div>
          </Dialog>
        </>
      );
    }
    return <Demo />;
  },
};
