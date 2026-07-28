// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../Table';

afterEach(cleanup);

function Demo() {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>Alpha</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Beta</TableCell>
          <TableCell>Disabled</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('renders a real table element', () => {
    render(<Demo />);
    expect(screen.getByRole('table')).toBeDefined();
  });

  it('renders header cells with columnheader role', () => {
    render(<Demo />);
    expect(screen.getAllByRole('columnheader').map((el) => el.textContent)).toEqual([
      'Name',
      'Status',
    ]);
  });

  it('renders the correct number of body rows and cells', () => {
    render(<Demo />);
    expect(screen.getAllByRole('row').length).toBe(3); // 1 header + 2 body
    expect(screen.getAllByRole('cell').length).toBe(4);
  });
});
