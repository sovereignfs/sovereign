import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { Button } from '../components/Button/Button';

const meta = {
  title: 'Components/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: 'Users' },
};

export const WithDescription: Story = {
  args: {
    title: 'Users',
    description: 'Manage who has access to this instance.',
  },
};

export const WithAction: Story = {
  args: {
    title: 'Users',
    description: 'Manage who has access to this instance.',
    action: <Button size="sm">Invite user</Button>,
  },
};
