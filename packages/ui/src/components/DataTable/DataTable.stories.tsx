import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, type DataTableColumn } from './DataTable';
import { StatusBadge } from '../StatusBadge/StatusBadge';

interface PluginRow {
  id: string;
  name: string;
  installs: number;
  status: 'synced' | 'draft';
}

const ROWS: PluginRow[] = [
  { id: 'tasks', name: 'sovereign-tasks', installs: 482, status: 'synced' },
  { id: 'ledger', name: 'sovereign-ledger', installs: 219, status: 'synced' },
  { id: 'shopper', name: 'sovereign-shopper', installs: 37, status: 'draft' },
  { id: 'healthlog', name: 'sovereign-healthlog', installs: 1204, status: 'synced' },
];

const columns: DataTableColumn<PluginRow>[] = [
  { key: 'name', header: 'Plugin', sortable: true },
  { key: 'installs', header: 'Installs', sortable: true, align: 'end' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

const meta = {
  title: 'Components/DataTable',
  component: DataTable,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Sortable table built on Table. Column-driven: pass columns + data instead of composing TableRow/TableCell by hand. Clicking a sortable header cycles ascending → descending → unsorted.',
      },
    },
  },
  args: { columns: [], data: [], getRowKey: (row: PluginRow) => row.id },
} satisfies Meta<typeof DataTable<PluginRow>>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const Default: Story = {
  render: () => <DataTable columns={columns} data={ROWS} getRowKey={(row) => row.id} />,
};

export const DefaultSorted: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={ROWS}
      getRowKey={(row) => row.id}
      defaultSortKey="installs"
      defaultSortDirection="desc"
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      getRowKey={(row) => row.id}
      emptyMessage="No plugins installed"
    />
  ),
};
