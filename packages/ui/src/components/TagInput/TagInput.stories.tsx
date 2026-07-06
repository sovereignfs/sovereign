import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TagInput } from './TagInput';
import { FormField } from '../FormField/FormField';

const meta = {
  title: 'Components/TagInput',
  component: TagInput,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Controlled multi-value input for frontmatter tags, labels, and lightweight taxonomies.',
      },
    },
  },
  args: {
    value: ['writing', 'launch'],
    onChange: () => {},
  },
} satisfies Meta<typeof TagInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledTagInput({
  initial = ['writing', 'launch'],
  disabled = false,
  error,
}: {
  initial?: string[];
  disabled?: boolean;
  error?: string;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <TagInput
      value={tags}
      onChange={setTags}
      placeholder="Add tag"
      disabled={disabled}
      error={error}
      aria-label="Tags"
    />
  );
}

export const Default: Story = {
  render: () => <ControlledTagInput />,
};

export const WithFormField: Story = {
  render: () => {
    const [tags, setTags] = useState(['plainwrite', 'frontmatter']);
    return (
      <FormField label="Tags" hint="Press Enter or comma to add a tag." id="story-tags">
        {(field) => (
          <TagInput
            {...field}
            value={tags}
            onChange={setTags}
            validateTag={(tag) =>
              tag.length > 24 ? 'Tags must be 24 characters or fewer.' : undefined
            }
          />
        )}
      </FormField>
    );
  },
};

export const Error: Story = {
  render: () => <ControlledTagInput error="At least one public tag is required." />,
};

export const Disabled: Story = {
  render: () => <ControlledTagInput disabled />,
};

export const Keyboard: Story = {
  render: () => {
    const [tags, setTags] = useState<string[]>([]);
    return (
      <TagInput
        value={tags}
        onChange={setTags}
        hint="Enter adds; comma separates; Backspace removes the last chip when the input is empty."
        placeholder="Type and press Enter"
        aria-label="Keyboard tag input"
      />
    );
  },
};

export const LongContent: Story = {
  render: () => (
    <ControlledTagInput
      initial={['editorial-calendar', 'launch', 'very-long-tag-name-that-still-clips', 'published']}
    />
  ),
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => <ControlledTagInput initial={['mobile', 'touch', 'frontmatter']} />,
};
