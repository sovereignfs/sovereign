import type { Meta, StoryObj } from '@storybook/react-vite';
import { ButtonLink } from './ButtonLink';

const meta = {
  title: 'Components/ButtonLink',
  component: ButtonLink,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A link that looks like a `Button`, for an action that goes to another page. Shares the button’s styling; pass `renderLink` to use a router’s own link element.',
      },
    },
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'destructive'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
  args: { href: '#', children: 'Add an app' },
} satisfies Meta<typeof ButtonLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'Back to apps' } };
