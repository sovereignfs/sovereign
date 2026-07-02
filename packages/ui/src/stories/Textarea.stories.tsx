import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from '../components/Textarea/Textarea';

// Wrap in a label so a11y checks pass (Textarea is a bare <textarea> — no
// built-in label association).
function Labeled({ label, ...props }: React.ComponentProps<typeof Textarea> & { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
      <label
        htmlFor="sb-textarea"
        style={{ fontSize: 14, color: 'var(--sv-color-text-primary)', fontFamily: 'system-ui' }}
      >
        {label}
      </label>
      <Textarea id="sb-textarea" {...props} />
    </div>
  );
}

const meta = {
  title: 'Components/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The primitive multi-line text field. RSC-safe; forwards all native `<textarea>` props. No label is built-in — always pair with a `<label>` (or `FormField`) for accessibility.',
      },
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (_args) => <Labeled label="Description" placeholder="Add a description…" />,
};

export const WithValue: Story = {
  render: (_args) => <Labeled label="Notes" defaultValue="Follow up next week." />,
};

export const CustomRows: Story = {
  render: (_args) => <Labeled label="Message" rows={8} placeholder="Write your message…" />,
};

export const Disabled: Story = {
  render: (_args) => <Labeled label="Read-only field" defaultValue="Cannot be changed" disabled />,
};
