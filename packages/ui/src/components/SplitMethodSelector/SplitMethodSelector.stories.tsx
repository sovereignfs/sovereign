import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SplitMethodSelector, type SplitMethod } from './SplitMethodSelector';

const meta = {
  title: 'Components/SplitMethodSelector',
  component: SplitMethodSelector,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The four-way Equal/Amount/Percentage/Shares picker shared by any cost-splitting plugin. A thin SegmentedControl preset that centralizes the option list and labels.',
      },
    },
  },
  args: {
    value: 'equal',
    onChange: () => {},
  },
} satisfies Meta<typeof SplitMethodSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledSelector() {
  const [value, setValue] = useState<SplitMethod>('equal');
  return <SplitMethodSelector value={value} onChange={setValue} />;
}

export const Default: Story = {
  render: () => <ControlledSelector />,
};
