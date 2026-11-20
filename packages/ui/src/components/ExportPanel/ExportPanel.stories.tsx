import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExportPanel } from './ExportPanel';

const base = {
  onStart: async () => ({ ok: true }) as const,
  downloadAction: (id: string) => `/api/exports/${id}`,
  confirmTitle: 'Download your data?',
  confirmMessage:
    'Your data is gathered from this instance and the apps you use. It is ready to download once, within the hour.',
  startLabel: 'Get my data',
};
const at = Date.UTC(2026, 10, 20, 10, 0);

const meta = {
  title: 'Components/ExportPanel',
  component: ExportPanel,
  parameters: {
    docs: {
      description: {
        component:
          'Taking an export and downloading it once, for an operator’s export or a person’s. The consumer says how to start one (with the password typed), where the download posts and how to look again.',
      },
    },
  },
  args: { ...base, status: { state: 'none' } },
} satisfies Meta<typeof ExportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Making: Story = { args: { status: { state: 'making', requestedAt: at } } };

export const Ready: Story = {
  args: {
    status: { state: 'ready', id: 'abc', size: 7_340_032, until: at + 3_600_000, here: true },
  },
};

export const NotYetPossible: Story = {
  args: {
    status: { state: 'none' },
    disabledReason: 'Save a key above before taking an export.',
    startLabel: 'Export',
  },
};

export const Failed: Story = { args: { status: { state: 'failed', finishedAt: at } } };
