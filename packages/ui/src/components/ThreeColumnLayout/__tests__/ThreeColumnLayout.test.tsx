// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThreeColumnLayout } from '../ThreeColumnLayout';

afterEach(cleanup);

describe('ThreeColumnLayout', () => {
  it('renders two columns and no detail column when only sidebar + main are given', () => {
    render(
      <ThreeColumnLayout>
        <nav>Sidebar</nav>
        <main>Main</main>
      </ThreeColumnLayout>,
    );

    expect(screen.getByText('Sidebar')).toBeDefined();
    expect(screen.getByText('Main')).toBeDefined();
  });

  it('renders the detail column when a third child is given', () => {
    render(
      <ThreeColumnLayout>
        <nav>Sidebar</nav>
        <main>Main</main>
        <aside>Detail</aside>
      </ThreeColumnLayout>,
    );

    expect(screen.getByText('Detail')).toBeDefined();
  });

  it('omits the detail column when the third child is conditionally falsy', () => {
    const selected = false;
    render(
      <ThreeColumnLayout>
        <nav>Sidebar</nav>
        <main>Main</main>
        {selected && <aside>Detail</aside>}
      </ThreeColumnLayout>,
    );

    expect(screen.queryByText('Detail')).toBeNull();
  });

  it('applies sidebarWidth and detailWidth as inline widths', () => {
    render(
      <ThreeColumnLayout sidebarWidth={240} detailWidth={320}>
        <nav>Sidebar</nav>
        <main>Main</main>
        <aside>Detail</aside>
      </ThreeColumnLayout>,
    );

    expect(screen.getByText('Sidebar').parentElement?.style.width).toBe('240px');
    expect(screen.getByText('Detail').parentElement?.style.width).toBe('320px');
  });

  it('warns in development when given fewer than 2 or more than 3 children', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<ThreeColumnLayout>{[<main key="only">Only</main>]}</ThreeColumnLayout>);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('received 1'));

    warn.mockClear();
    render(
      <ThreeColumnLayout>
        <nav>A</nav>
        <main>B</main>
        <aside>C</aside>
        <aside>D</aside>
      </ThreeColumnLayout>,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('received 4'));

    warn.mockRestore();
  });
});
