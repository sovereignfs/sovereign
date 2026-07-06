import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeTextarea } from './CodeTextarea';
import { FormField } from '../FormField/FormField';

const sampleMarkdown = `---
title: Editorial calendar
tags:
  - planning
  - launch
---

# Launch notes

Draft the announcement and verify links before publishing.`;

const meta = {
  title: 'Components/CodeTextarea',
  component: CodeTextarea,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Monospace textarea for Markdown, YAML, JSON, and other whitespace-sensitive content.',
      },
    },
  },
  args: {
    defaultValue: sampleMarkdown,
    'aria-label': 'Markdown source',
  },
} satisfies Meta<typeof CodeTextarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFormField: Story = {
  render: () => (
    <FormField label="Frontmatter" hint="YAML is saved exactly as typed." id="frontmatter-source">
      {(field) => <CodeTextarea {...field} defaultValue={sampleMarkdown} />}
    </FormField>
  ),
};

export const Error: Story = {
  render: () => (
    <FormField label="Raw YAML" error="Line 3: expected a value." id="yaml-source">
      {(field) => <CodeTextarea {...field} invalid defaultValue={'title:\ntags:\n  -'} />}
    </FormField>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: sampleMarkdown,
  },
};

export const LongContent: Story = {
  args: {
    defaultValue: Array.from({ length: 24 }, (_, index) => `- item-${index + 1}: pending`).join(
      '\n',
    ),
  },
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  args: {
    defaultValue: sampleMarkdown,
  },
};
