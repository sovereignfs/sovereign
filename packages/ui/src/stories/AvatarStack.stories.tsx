import type { Meta, StoryObj } from '@storybook/react-vite';
import { AvatarStack } from '../components/AvatarStack/AvatarStack';

const people = [
  { name: 'Ada Lovelace' },
  { name: 'Grace Hopper' },
  { name: 'Sam Rivera' },
  { name: 'Noor Khan' },
  { name: 'Leila Haddad' },
  { name: 'Tomás Silva' },
];

const meta = {
  title: 'Components/AvatarStack',
  component: AvatarStack,
  parameters: { layout: 'centered' },
  args: { people },
} satisfies Meta<typeof AvatarStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Beyond: Story = {};

export const Few: Story = { args: { people: people.slice(0, 3) } };

export const One: Story = { args: { people: people.slice(0, 1) } };

export const Labelled: Story = { args: { people: people.slice(0, 3), label: 'Going' } };

export const AllSizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AvatarStack {...args} size="sm" />
      <AvatarStack {...args} size="md" />
      <AvatarStack {...args} size="lg" />
    </div>
  ),
};
