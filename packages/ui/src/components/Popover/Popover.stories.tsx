import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Popover } from './Popover';
import { Button } from '../Button/Button';

const meta = {
  title: 'Components/Popover',
  component: Popover,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Floating panel anchored below a trigger. Non-modal: closes on outside click or Escape. `align` controls which trigger edge the panel aligns to.',
      },
    },
  },
  args: {
    open: false,
    onClose: () => {},
    trigger: <button type="button">Trigger</button>,
    'aria-label': 'Popover',
    children: null,
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  fontFamily: 'var(--sv-font-family)',
  fontSize: 'var(--sv-font-size-sm)',
  color: 'var(--sv-color-text-primary)',
  borderBottom: '1px solid var(--sv-color-border)',
  cursor: 'pointer',
};

/** Notification bell popover — right-aligned, 288px. */
export const Notifications: Story = {
  render: (_args) => {
    const [open, setOpen] = useState(false);

    return (
      <div style={{ padding: 40 }}>
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          align="right"
          aria-label="Notifications"
          trigger={
            <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
              🔔
            </Button>
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--sv-color-border)',
              fontFamily: 'var(--sv-font-family)',
            }}
          >
            <span
              style={{
                fontWeight: 'var(--sv-font-weight-semibold)',
                fontSize: 'var(--sv-font-size-sm)',
                color: 'var(--sv-color-text-primary)',
              }}
            >
              Notifications
            </span>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: 'var(--sv-font-size-caption)',
                color: 'var(--sv-color-text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--sv-font-family)',
              }}
            >
              Mark all read
            </button>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 20 }}>📦</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'var(--sv-font-weight-medium)' }}>Plugin updated</div>
              <div
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                }}
              >
                1 hour ago
              </div>
            </div>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 20 }}>✉️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'var(--sv-font-weight-medium)' }}>Invite accepted</div>
              <div
                style={{
                  fontSize: 'var(--sv-font-size-caption)',
                  color: 'var(--sv-color-text-muted)',
                }}
              >
                2 min ago
              </div>
            </div>
          </div>
        </Popover>
      </div>
    );
  },
};

/** User menu — right-aligned with identity header and nav rows. */
export const UserMenu: Story = {
  render: (_args) => {
    const [open, setOpen] = useState(false);

    const menuRowStyle: React.CSSProperties = {
      ...rowStyle,
      gap: 10,
      cursor: 'default',
    };

    return (
      <div style={{ padding: 40 }}>
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          align="right"
          aria-label="User menu"
          trigger={
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--sv-color-accent)',
                color: 'var(--sv-color-text-on-accent)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--sv-font-family)',
                fontWeight: 600,
                fontSize: 13,
              }}
              aria-label="Open user menu"
            >
              KB
            </button>
          }
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--sv-color-border)',
              fontFamily: 'var(--sv-font-family)',
            }}
          >
            <div
              style={{
                fontWeight: 'var(--sv-font-weight-semibold)',
                fontSize: 'var(--sv-font-size-sm)',
                color: 'var(--sv-color-text-primary)',
              }}
            >
              Kasun Benthara
            </div>
            <div
              style={{
                fontSize: 'var(--sv-font-size-caption)',
                color: 'var(--sv-color-text-muted)',
              }}
            >
              kasun@openfs.io
            </div>
          </div>
          {['Account', 'Console', 'Sign out'].map((item) => (
            <div key={item} style={menuRowStyle}>
              {item}
            </div>
          ))}
        </Popover>
      </div>
    );
  },
};

/** Left-aligned variant. */
export const LeftAligned: Story = {
  render: (_args) => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: 40 }}>
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          align="left"
          aria-label="Options"
          trigger={<Button onClick={() => setOpen((o) => !o)}>Open (left-aligned)</Button>}
        >
          <div
            style={{
              padding: 16,
              fontFamily: 'var(--sv-font-family)',
              fontSize: 'var(--sv-font-size-sm)',
              color: 'var(--sv-color-text-muted)',
            }}
          >
            Panel aligns to the left edge of the trigger.
          </div>
        </Popover>
      </div>
    );
  },
};

/** `panelStyle` overrides the panel's own chrome (square corners here) —
 *  an escape hatch for compact pickers where the default rounded panel
 *  doesn't fit the content (e.g. a small colour-swatch grid). */
export const SquareCorners: Story = {
  render: (_args) => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ padding: 40 }}>
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          align="left"
          width={160}
          panelStyle={{ borderRadius: 0 }}
          aria-label="Colour"
          trigger={<Button onClick={() => setOpen((o) => !o)}>Open (square panel)</Button>}
        >
          <div
            style={{
              padding: 16,
              fontFamily: 'var(--sv-font-family)',
              fontSize: 'var(--sv-font-size-sm)',
              color: 'var(--sv-color-text-muted)',
            }}
          >
            No rounded corners.
          </div>
        </Popover>
      </div>
    );
  },
};
