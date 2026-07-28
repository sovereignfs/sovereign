// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Accordion } from '../Accordion';

afterEach(cleanup);

const items = [
  { id: 'a', trigger: 'Section A', content: 'Content A' },
  { id: 'b', trigger: 'Section B', content: 'Content B' },
];

describe('Accordion', () => {
  it('renders a trigger button per item', () => {
    render(<Accordion items={items} type="single" openIds={[]} onOpenIdsChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Section A' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Section B' })).toBeDefined();
  });

  it('type="single": opening one section replaces the open set entirely', () => {
    const onOpenIdsChange = vi.fn();
    render(
      <Accordion items={items} type="single" openIds={['a']} onOpenIdsChange={onOpenIdsChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Section B' }));
    expect(onOpenIdsChange).toHaveBeenCalledWith(['b']);
  });

  it('type="multiple": opening a section adds to the open set', () => {
    const onOpenIdsChange = vi.fn();
    render(
      <Accordion items={items} type="multiple" openIds={['a']} onOpenIdsChange={onOpenIdsChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Section B' }));
    expect(onOpenIdsChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('type="multiple": closing an open section removes only that id', () => {
    const onOpenIdsChange = vi.fn();
    render(
      <Accordion
        items={items}
        type="multiple"
        openIds={['a', 'b']}
        onOpenIdsChange={onOpenIdsChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Section A' }));
    expect(onOpenIdsChange).toHaveBeenCalledWith(['b']);
  });

  it('reflects openIds via aria-expanded on each trigger', () => {
    render(<Accordion items={items} type="single" openIds={['a']} onOpenIdsChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Section A' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Section B' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });
});
