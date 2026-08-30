import type { Meta, StoryObj } from '@storybook/react-vite';
import { GripIcon } from '../components/GripIcon/GripIcon';

const meta: Meta<typeof GripIcon> = {
  title: 'Components/GripIcon',
  component: GripIcon,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof GripIcon>;

export const Default: Story = {
  render: () => (
    <div style={{ color: 'var(--sv-color-text-muted)' }}>
      <GripIcon />
    </div>
  ),
};

export const LargeSize: Story = {
  render: () => (
    <div style={{ color: 'var(--sv-color-text-muted)' }}>
      <GripIcon size={28} />
    </div>
  ),
  name: 'Size variant (28px)',
};
