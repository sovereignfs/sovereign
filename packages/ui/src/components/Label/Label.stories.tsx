import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './Label';

const meta = {
  title: 'Components/Label',
  component: Label,
  parameters: { layout: 'padded' },
  args: { children: 'Label text' },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

export const WithControl: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Label htmlFor="example-input">Email address</Label>
      <input
        id="example-input"
        type="email"
        placeholder="you@example.com"
        style={{
          padding: 'var(--sv-space-2) var(--sv-space-3)',
          border: '1px solid var(--sv-color-border-strong)',
          borderRadius: 'var(--sv-radius-md)',
          fontFamily: 'var(--sv-font-family)',
          fontSize: 'var(--sv-font-size-sm)',
        }}
      />
    </div>
  ),
};
