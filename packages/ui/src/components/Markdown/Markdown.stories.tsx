import type { Meta, StoryObj } from '@storybook/react-vite';
import { Markdown } from './Markdown';

const sample = `# Privacy Policy

This document describes the built-in, default behavior of **Sovereign**.

> Replaced content from an operator overrides this default.

## What we collect

- **Email address** and password.
- *Time zone*, detected automatically at signup.

See the [project source](https://github.com/sovereignfs/sovereign) for details.
`;

const meta = {
  title: 'Components/Markdown',
  component: Markdown,
  parameters: { layout: 'padded' },
  args: { content: sample },
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {};
