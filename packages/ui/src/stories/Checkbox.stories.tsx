import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Checkbox } from '../components/Checkbox/Checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'Components/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => {
    const [checked, setChecked] = useState(false);
    return <Checkbox checked={checked} onChange={setChecked} label="Task title" />;
  },
};

export const Checked: Story = {
  render: () => {
    const [checked, setChecked] = useState(true);
    return <Checkbox checked={checked} onChange={setChecked} label="Already done" />;
  },
};

export const WithStrikeThrough: Story = {
  name: 'Strike-through on complete',
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <Checkbox checked={checked} onChange={setChecked} label="Click to complete" strikeThrough />
    );
  },
};

export const Disabled: Story = {
  render: () => <Checkbox checked={false} onChange={() => {}} label="Cannot interact" disabled />,
};

export const DisabledChecked: Story = {
  render: () => <Checkbox checked onChange={() => {}} label="Locked complete" disabled />,
};
