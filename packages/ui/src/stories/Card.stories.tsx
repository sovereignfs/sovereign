import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from '../components/Card/Card';

const meta = {
  title: 'Components/Card',
  component: Card,
  parameters: { layout: 'padded' },
  args: { children: 'Card content goes here.' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SmallPadding: Story = { args: { padding: 'sm' } };
export const LargePadding: Story = { args: { padding: 'lg' } };

export const Interactive: Story = {
  args: {
    as: 'article',
    interactive: true,
    children: 'Click me — I have hover + focus styles.',
  },
};

export const AsListItem: Story = {
  render: () => (
    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Card as="li">First item</Card>
      <Card as="li">Second item</Card>
      <Card as="li">Third item</Card>
    </ul>
  ),
};
