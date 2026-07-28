// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '../DataTable';

afterEach(cleanup);

interface Plugin {
  id: string;
  name: string;
  installs: number;
}

const data: Plugin[] = [
  { id: 'a', name: 'Charlie', installs: 12 },
  { id: 'b', name: 'Alpha', installs: 30 },
  { id: 'c', name: 'Bravo', installs: 5 },
];

const columns: DataTableColumn<Plugin>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'installs', header: 'Installs', sortable: true, align: 'end' },
];

function rowsText() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
}

describe('DataTable', () => {
  it('renders a row per data item and a header per column', () => {
    render(<DataTable columns={columns} data={data} getRowKey={(row) => row.id} />);
    expect(screen.getAllByRole('row')).toHaveLength(4); // 1 header + 3 body rows
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Installs' })).toBeDefined();
  });

  it('renders cell values from row[key] by default', () => {
    render(<DataTable columns={columns} data={data} getRowKey={(row) => row.id} />);
    expect(screen.getByText('Charlie')).toBeDefined();
    expect(screen.getByText('30')).toBeDefined();
  });

  it('uses a custom render function when provided', () => {
    const withRender: DataTableColumn<Plugin>[] = [
      { key: 'name', header: 'Name' },
      { key: 'installs', header: 'Installs', render: (row) => `${row.installs} installs` },
    ];
    render(<DataTable columns={withRender} data={data} getRowKey={(row) => row.id} />);
    expect(screen.getByText('30 installs')).toBeDefined();
  });

  it('shows an empty state instead of a table when data is empty', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        getRowKey={(row) => row.id}
        emptyMessage="No plugins"
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No plugins')).toBeDefined();
  });

  it('non-sortable columns render as plain text, not a button', () => {
    const withPlain: DataTableColumn<Plugin>[] = [{ key: 'name', header: 'Name' }];
    render(<DataTable columns={withPlain} data={data} getRowKey={(row) => row.id} />);
    expect(screen.queryByRole('button', { name: 'Name' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBeNull();
  });

  it('clicking a sortable header sorts ascending, then descending, then clears', () => {
    render(<DataTable columns={columns} data={data} getRowKey={(row) => row.id} />);
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    const button = within(nameHeader).getByRole('button');

    fireEvent.click(button);
    expect(rowsText()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(button);
    expect(rowsText()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(nameHeader.getAttribute('aria-sort')).toBe('descending');

    fireEvent.click(button);
    expect(rowsText()).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(nameHeader.getAttribute('aria-sort')).toBe('none');
  });

  it('sorts numeric columns numerically, not lexicographically', () => {
    render(<DataTable columns={columns} data={data} getRowKey={(row) => row.id} />);
    const installsHeader = screen.getByRole('columnheader', { name: 'Installs' });
    fireEvent.click(within(installsHeader).getByRole('button'));
    expect(rowsText()).toEqual(['Bravo', 'Charlie', 'Alpha']); // 5, 12, 30
  });

  it('switching the sort column resets to ascending', () => {
    render(<DataTable columns={columns} data={data} getRowKey={(row) => row.id} />);
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    const installsHeader = screen.getByRole('columnheader', { name: 'Installs' });
    fireEvent.click(within(nameHeader).getByRole('button'));
    fireEvent.click(within(nameHeader).getByRole('button')); // now descending
    fireEvent.click(within(installsHeader).getByRole('button'));
    expect(installsHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(nameHeader.getAttribute('aria-sort')).toBe('none');
  });

  it('respects defaultSortKey/defaultSortDirection', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowKey={(row) => row.id}
        defaultSortKey="installs"
        defaultSortDirection="desc"
      />,
    );
    expect(rowsText()).toEqual(['Alpha', 'Charlie', 'Bravo']); // 30, 12, 5
  });
});
