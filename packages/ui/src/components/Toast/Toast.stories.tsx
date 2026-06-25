import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastProvider, useToast } from './Toast';

const meta = {
  title: 'Components/Toast',
  component: ToastProvider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Fixed top-right notification stack. Use `<ToastProvider>` at the app root and `useToast()` to imperatively show toasts. Each toast has a leading status icon matched to its category.',
      },
    },
  },
  args: {
    children: null,
  },
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

function ToastTrigger({ category, label }: { category: string; label: string }) {
  const { show } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        show({
          title: label,
          message: `This is a ${category} toast notification.`,
          category,
        })
      }
      style={{
        padding: '8px 16px',
        borderRadius: 'var(--sv-radius-md)',
        border: '1px solid var(--sv-color-border)',
        background: 'var(--sv-color-surface)',
        color: 'var(--sv-color-text-primary)',
        fontFamily: 'var(--sv-font-family)',
        fontSize: 'var(--sv-font-size-sm)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

/** All toast categories — each button fires a toast with the matching leading icon. */
export const AllCategories: Story = {
  render: (_args) => (
    <ToastProvider>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <ToastTrigger category="info" label="Info toast" />
        <ToastTrigger category="success" label="Success toast" />
        <ToastTrigger category="warning" label="Warning toast" />
        <ToastTrigger category="error" label="Error toast" />
        <ToastTrigger category="security" label="Security toast" />
        <ToastTrigger category="announcement" label="Announcement toast" />
      </div>
    </ToastProvider>
  ),
};

/** Toast with no body — title only. */
export const TitleOnly: Story = {
  render: (_args) => {
    function Trigger() {
      const { show } = useToast();
      return (
        <button
          type="button"
          onClick={() => show({ title: 'Session expires in 5 minutes', category: 'warning' })}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--sv-radius-md)',
            border: '1px solid var(--sv-color-border)',
            background: 'var(--sv-color-surface)',
            color: 'var(--sv-color-text-primary)',
            fontFamily: 'var(--sv-font-family)',
            fontSize: 'var(--sv-font-size-sm)',
            cursor: 'pointer',
          }}
        >
          Show title-only toast
        </button>
      );
    }
    return (
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
  },
};

/** Persistent toast — pass `duration: 0` to disable auto-dismiss. */
export const Persistent: Story = {
  render: (_args) => {
    function Trigger() {
      const { show } = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            show({
              title: 'Maintenance mode active',
              message: 'Platform is in read-only mode. Dismiss when resolved.',
              category: 'error',
              duration: 0,
            })
          }
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--sv-radius-md)',
            border: '1px solid var(--sv-color-border)',
            background: 'var(--sv-color-surface)',
            color: 'var(--sv-color-text-primary)',
            fontFamily: 'var(--sv-font-family)',
            fontSize: 'var(--sv-font-size-sm)',
            cursor: 'pointer',
          }}
        >
          Show persistent toast
        </button>
      );
    }
    return (
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
  },
};

/** Multiple toasts stack vertically below the first. */
export const Stacked: Story = {
  render: (_args) => {
    function Trigger() {
      const { show } = useToast();
      const [fired, setFired] = useState(false);
      return (
        <button
          type="button"
          disabled={fired}
          onClick={() => {
            show({ title: 'Plugin installed', category: 'success' });
            show({
              title: 'License warning',
              message: 'Expires in 3 days.',
              category: 'warning',
            });
            show({ title: 'Backup failed', message: 'Check storage quota.', category: 'error' });
            setFired(true);
          }}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--sv-radius-md)',
            border: '1px solid var(--sv-color-border)',
            background: 'var(--sv-color-surface)',
            color: 'var(--sv-color-text-primary)',
            fontFamily: 'var(--sv-font-family)',
            fontSize: 'var(--sv-font-size-sm)',
            cursor: fired ? 'default' : 'pointer',
            opacity: fired ? 0.5 : 1,
          }}
        >
          Fire 3 toasts
        </button>
      );
    }
    return (
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
  },
};
