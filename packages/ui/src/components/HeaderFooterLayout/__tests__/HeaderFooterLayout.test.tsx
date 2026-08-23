// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HeaderFooterLayout } from '../HeaderFooterLayout';

afterEach(cleanup);

describe('HeaderFooterLayout', () => {
  it('renders main content with no header/footer by default', () => {
    render(<HeaderFooterLayout>Main content</HeaderFooterLayout>);

    expect(screen.getByText('Main content')).toBeDefined();
    expect(screen.queryByText('Header')).toBeNull();
    expect(screen.queryByText('Footer')).toBeNull();
  });

  it('renders header and footer when given', () => {
    render(
      <HeaderFooterLayout header={<span>Header</span>} footer={<span>Footer</span>}>
        Main content
      </HeaderFooterLayout>,
    );

    expect(screen.getByText('Header')).toBeDefined();
    expect(screen.getByText('Main content')).toBeDefined();
    expect(screen.getByText('Footer')).toBeDefined();
  });

  it('renders header without a footer', () => {
    render(<HeaderFooterLayout header={<span>Header</span>}>Main content</HeaderFooterLayout>);

    expect(screen.getByText('Header')).toBeDefined();
    expect(screen.queryByText('Footer')).toBeNull();
  });

  it('renders footer without a header', () => {
    render(<HeaderFooterLayout footer={<span>Footer</span>}>Main content</HeaderFooterLayout>);

    expect(screen.queryByText('Header')).toBeNull();
    expect(screen.getByText('Footer')).toBeDefined();
  });

  it('applies headerHeight and footerHeight as inline heights', () => {
    render(
      <HeaderFooterLayout
        header={<span>Header</span>}
        footer={<span>Footer</span>}
        headerHeight={48}
        footerHeight={72}
      >
        Main content
      </HeaderFooterLayout>,
    );

    expect(screen.getByText('Header').parentElement?.style.height).toBe('48px');
    expect(screen.getByText('Footer').parentElement?.style.height).toBe('72px');
  });
});
