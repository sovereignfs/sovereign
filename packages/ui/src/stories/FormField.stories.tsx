import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormField } from '../components/FormField/FormField';
import { Input } from '../components/Input/Input';

const meta = {
  title: 'Components/FormField',
  component: FormField,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Email address',
    htmlFor: 'email',
    children: <Input id="email" type="email" placeholder="you@example.com" />,
  },
};

export const WithHint: Story = {
  args: {
    label: 'Username',
    hint: 'Letters, numbers, and underscores only.',
    htmlFor: 'username',
    children: <Input id="username" placeholder="your_username" />,
  },
};

export const WithError: Story = {
  args: {
    label: 'Password',
    error: 'Password must be at least 8 characters.',
    htmlFor: 'password',
    children: <Input id="password" type="password" />,
  },
};

export const Required: Story = {
  args: {
    label: 'Full name',
    required: true,
    htmlFor: 'name',
    children: <Input id="name" placeholder="Jane Smith" />,
  },
};
