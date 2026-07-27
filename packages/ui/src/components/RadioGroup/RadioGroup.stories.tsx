import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadioGroup } from './RadioGroup';
import { FormField } from '../FormField/FormField';

const meta = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Single-select list of options. Renders real `<input type="radio">` elements sharing one `name`, so keyboard arrow-key navigation between options is native browser behavior.',
      },
    },
  },
  args: {
    items: [
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
    ],
    value: 'md',
    onChange: () => {},
    'aria-label': 'Size',
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <RadioGroup {...args} value={value} onChange={setValue} />;
  },
};

export const WithDisabledItem: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <RadioGroup
        {...args}
        items={[...args.items, { label: 'X-Large (out of stock)', value: 'xl', disabled: true }]}
        value={value}
        onChange={setValue}
      />
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const InFormField: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <FormField label="Shirt size" error="Select a size to continue.">
        {(field) => <RadioGroup {...args} {...field} value={value} onChange={setValue} />}
      </FormField>
    );
  },
};
