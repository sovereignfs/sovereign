import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

// Wrap in a label so a11y checks pass (Input is a bare <input> — no built-in
// label association).
function Labeled({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        htmlFor="sb-input"
        style={{ fontSize: 14, color: 'var(--sv-color-text-primary)', fontFamily: 'system-ui' }}
      >
        {label}
      </label>
      <Input id="sb-input" {...props} />
    </div>
  );
}

const meta = {
  title: 'Components/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The primitive text field. RSC-safe; forwards all native `<input>` props. No label is built-in — always pair with a `<label>` for accessibility.',
      },
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Text: Story = {
  render: () => <Labeled label="Display name" type="text" placeholder="e.g. Jane Smith" />,
};

export const Email: Story = {
  render: () => <Labeled label="Email address" type="email" placeholder="you@example.com" />,
};

export const Password: Story = {
  render: () => <Labeled label="Password" type="password" placeholder="••••••••" />,
};

export const Disabled: Story = {
  render: () => (
    <Labeled label="Read-only field" type="text" defaultValue="Cannot be changed" disabled />
  ),
};

/** Mimics an error state — the container adds red border via CSS token. */
export const ErrorState: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        htmlFor="sb-input-err"
        style={{ fontSize: 14, color: 'var(--sv-color-text-primary)', fontFamily: 'system-ui' }}
      >
        Email address
      </label>
      <Input
        id="sb-input-err"
        type="email"
        defaultValue="not-an-email"
        aria-invalid="true"
        aria-describedby="sb-input-err-msg"
        style={{
          borderColor: 'var(--sv-color-error-border)',
          outline: 'none',
        }}
      />
      <span
        id="sb-input-err-msg"
        style={{ fontSize: 12, color: 'var(--sv-color-error-text)', fontFamily: 'system-ui' }}
      >
        Enter a valid email address.
      </span>
    </div>
  ),
};
