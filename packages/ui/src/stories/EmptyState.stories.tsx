import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Button } from '../components/Button/Button';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { heading: 'No results found' },
};

export const WithIcon: Story = {
  args: {
    icon: 'search',
    heading: 'No results found',
    description: 'Try adjusting your search or filters.',
  },
};

export const WithAction: Story = {
  args: {
    icon: 'plus',
    heading: 'No plugins installed',
    description: 'Add your first plugin to get started.',
    action: <Button>Browse plugins</Button>,
  },
};
