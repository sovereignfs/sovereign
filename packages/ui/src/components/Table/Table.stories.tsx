import type { Meta, StoryObj } from '@storybook/react-vite';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from './Table';

const meta = {
  title: 'Components/Table',
  component: Table,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Thin, styled wrappers around the native table elements. Not a data grid — no sort/filter/virtualization. Horizontal scroll (masked-edge fade, hidden scrollbar) at any viewport size.',
      },
    },
  },
  args: { children: null },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

const ROWS = [
  { name: 'sovereign-tasks', status: 'Active', version: '1.4.2' },
  { name: 'sovereign-ledger', status: 'Active', version: '2.0.0' },
  { name: 'sovereign-shopper', status: 'Disabled', version: '0.9.1' },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Plugin</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Version</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.name}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.status}</TableCell>
            <TableCell>{row.version}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const WithoutHeader: Story = {
  render: () => (
    <Table>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.name}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const LongContent: Story = {
  render: () => (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Plugin</TableHeaderCell>
          <TableHeaderCell>Description</TableHeaderCell>
          <TableHeaderCell>Author</TableHeaderCell>
          <TableHeaderCell>Repository</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Version</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.name}>
            <TableCell>{row.name}</TableCell>
            <TableCell>A longer description column to force horizontal overflow</TableCell>
            <TableCell>sovereign-community</TableCell>
            <TableCell>github.com/sovereignfs/{row.name}</TableCell>
            <TableCell>{row.status}</TableCell>
            <TableCell>{row.version}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const NarrowViewport: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Plugin</TableHeaderCell>
          <TableHeaderCell>Description</TableHeaderCell>
          <TableHeaderCell>Author</TableHeaderCell>
          <TableHeaderCell>Repository</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Version</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.name}>
            <TableCell>{row.name}</TableCell>
            <TableCell>A longer description column to force horizontal overflow</TableCell>
            <TableCell>sovereign-community</TableCell>
            <TableCell>github.com/sovereignfs/{row.name}</TableCell>
            <TableCell>{row.status}</TableCell>
            <TableCell>{row.version}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
