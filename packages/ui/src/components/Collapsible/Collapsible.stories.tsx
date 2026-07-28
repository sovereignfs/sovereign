import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Collapsible } from './Collapsible';

const meta = {
  title: 'Components/Collapsible',
  component: Collapsible,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Single expand/collapse primitive. Independently useful (e.g. a "show more" toggle), and composed internally by Accordion.',
      },
    },
  },
  args: { open: false, onOpenChange: () => {}, trigger: 'Trigger', children: 'Content' },
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <Collapsible open={open} onOpenChange={setOpen} trigger="What plugins are installed?">
        Sovereign ships with the platform plugins (Console, Launcher, Account) plus whatever you've
        declared in your own sovereign.plugins.json — nothing else is bundled by default.
      </Collapsible>
    );
  },
};

export const StartsOpen: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <Collapsible open={open} onOpenChange={setOpen} trigger="Advanced settings">
        These settings are rarely needed — change them only if you know what you're doing.
      </Collapsible>
    );
  },
};

export const LongContent: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <Collapsible open={open} onOpenChange={setOpen} trigger="Full changelog">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Added component sizing alignment across the design system</li>
          <li>Added RadioGroup, Slider, Progress, Table, Alert primitives</li>
          <li>Added Breadcrumb, Pagination, and Kbd primitives</li>
          <li>Added Accordion and Collapsible primitives</li>
        </ul>
      </Collapsible>
    );
  },
};
