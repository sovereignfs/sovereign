import type { Meta, StoryObj } from '@storybook/react-vite';
import { Kbd } from './Kbd';

const meta = {
  title: 'Components/Kbd',
  component: Kbd,
  parameters: { layout: 'padded' },
  args: { children: '⌘K' },
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};

export const Letter: Story = {
  args: { children: 'S' },
};

export const Sequence: Story = {
  render: () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Kbd>Ctrl</Kbd>
      <span>+</span>
      <Kbd>Shift</Kbd>
      <span>+</span>
      <Kbd>P</Kbd>
    </span>
  ),
};
