import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Accordion } from './Accordion';

const meta = {
  title: 'Components/Accordion',
  component: Accordion,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One or more Collapsible sections. type="single" closes other sections when one opens; type="multiple" allows any number open at once.',
      },
    },
  },
  args: { items: [], type: 'single', openIds: [], onOpenIdsChange: () => {} },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  {
    id: 'plugins',
    trigger: 'What plugins ship by default?',
    content: 'Only the platform plugins (Console, Launcher, Account) plus Sovereign Tasks.',
  },
  {
    id: 'hosting',
    trigger: 'Can I self-host this?',
    content: 'Yes — Sovereign is designed to be self-hosted via Docker Compose.',
  },
  {
    id: 'pricing',
    trigger: 'Is it free?',
    content: 'The platform is open source. Individual plugins may have their own pricing.',
  },
];

export const Default: Story = {
  render: () => {
    const [openIds, setOpenIds] = useState<string[]>(['plugins']);
    return (
      <Accordion items={FAQ_ITEMS} type="single" openIds={openIds} onOpenIdsChange={setOpenIds} />
    );
  },
};

export const MultipleOpen: Story = {
  render: () => {
    const [openIds, setOpenIds] = useState<string[]>(['plugins', 'hosting']);
    return (
      <Accordion items={FAQ_ITEMS} type="multiple" openIds={openIds} onOpenIdsChange={setOpenIds} />
    );
  },
};

export const LongContent: Story = {
  render: () => {
    const [openIds, setOpenIds] = useState<string[]>(['changelog']);
    return (
      <Accordion
        items={[
          {
            id: 'changelog',
            trigger: 'Full changelog',
            content: (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Added component sizing alignment across the design system</li>
                <li>Added RadioGroup, Slider, Progress, Table, Alert primitives</li>
                <li>Added Breadcrumb, Pagination, and Kbd primitives</li>
                <li>Added Accordion and Collapsible primitives</li>
              </ul>
            ),
          },
        ]}
        type="single"
        openIds={openIds}
        onOpenIdsChange={setOpenIds}
      />
    );
  },
};

export const KeyboardInteraction: Story = {
  render: () => {
    const [openIds, setOpenIds] = useState<string[]>([]);
    return (
      <Accordion items={FAQ_ITEMS} type="single" openIds={openIds} onOpenIdsChange={setOpenIds} />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'What plugins ship by default?' });

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText(/Only the platform plugins/)).toBeVisible();

    await userEvent.keyboard(' ');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
};
