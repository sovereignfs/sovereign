import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from '../components/Avatar/Avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {
  args: { name: 'Jane Smith' },
};

export const SingleName: Story = {
  args: { name: 'Admin' },
};

export const WithImage: Story = {
  args: {
    name: 'Jane Smith',
    src: 'https://i.pravatar.cc/150?u=jane',
  },
};

export const BrokenImage: Story = {
  args: {
    name: 'Jane Smith',
    src: 'https://broken.invalid/avatar.png',
  },
};

export const AllSizes: Story = {
  args: { name: 'Jane Smith' },
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name="Jane Smith" size="sm" />
      <Avatar name="Jane Smith" size="md" />
      <Avatar name="Jane Smith" size="lg" />
    </div>
  ),
};
