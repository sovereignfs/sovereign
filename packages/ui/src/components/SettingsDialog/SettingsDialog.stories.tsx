import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { SettingsDialog, type SettingsGroup } from './SettingsDialog';

const paragraph = (text: string) => (
  <p style={{ color: 'var(--sv-color-text-primary)', margin: 0 }}>{text}</p>
);

const groups: SettingsGroup[] = [
  {
    id: 'you',
    sections: [
      { id: 'profile', label: 'Profile', icon: 'user', content: paragraph('Your name and email.') },
      {
        id: 'security',
        label: 'Security',
        icon: 'shield',
        content: paragraph('Your password and keys.'),
      },
    ],
  },
  {
    id: 'app',
    sections: [
      {
        id: 'preferences',
        label: 'Preferences',
        icon: 'settings',
        content: (
          <div style={{ display: 'grid', gap: 12 }}>
            {Array.from({ length: 30 }, (_, i) => (
              <div key={i}>{paragraph(`A long section scrolls inside the frame (${i + 1}).`)}</div>
            ))}
          </div>
        ),
      },
      { id: 'data', label: 'Data', icon: 'download', content: paragraph('Your export.') },
    ],
  },
];

function Demo({ search = false, size = 'lg' }: { search?: boolean; size?: 'lg' | 'fixed' }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<string | null>('profile');
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open settings</Button>
      <SettingsDialog
        open={open}
        onClose={() => setOpen(false)}
        groups={groups}
        active={active}
        onSelect={setActive}
        search={search}
        size={size}
      />
    </>
  );
}

const meta = {
  title: 'Components/SettingsDialog',
  component: Demo,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Settings as one dialog with a side navigation: sections in groups with a divider between them, each with an icon; an optional search; the section scrolling in a frame that never changes size. On a phone, the sections, then one with a back arrow. Controlled (`active`, `onSelect`), so that an app gives each section an address.',
      },
    },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Security' }));
    await expect(body.getByText('Your password and keys.')).toBeInTheDocument();
  },
};

export const WithSearch: Story = { args: { search: true } };

export const Capped: Story = { args: { size: 'fixed' } };

export const Phone: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
