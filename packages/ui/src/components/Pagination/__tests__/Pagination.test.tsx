// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Pagination } from '../Pagination';

afterEach(cleanup);

describe('Pagination', () => {
  it('marks the current page with aria-current="page"', () => {
    render(<Pagination page={3} totalPages={5} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBeNull();
  });

  it('calls onChange with the clicked page number', () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);
    screen.getByRole('button', { name: 'Page 4' }).click();
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('disables the previous button on the first page', () => {
    render(<Pagination page={1} totalPages={5} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', false);
  });

  it('disables the next button on the last page', () => {
    render(<Pagination page={5} totalPages={5} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
  });

  it('next/previous buttons step the page by one', () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);
    screen.getByRole('button', { name: 'Next page' }).click();
    expect(onChange).toHaveBeenLastCalledWith(4);
    screen.getByRole('button', { name: 'Previous page' }).click();
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('shows an ellipsis and jumps to the last page for a large page count', () => {
    render(<Pagination page={5} totalPages={20} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeDefined();
    expect(screen.queryAllByText('…').length).toBeGreaterThan(0);
  });

  it('renders no ellipsis for a small page count', () => {
    render(<Pagination page={2} totalPages={4} onChange={() => {}} />);
    expect(screen.queryAllByText('…').length).toBe(0);
    expect(screen.getAllByRole('button', { name: /^Page \d$/ }).length).toBe(4);
  });
});
