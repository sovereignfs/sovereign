// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { NavigationMenu } from '../NavigationMenu';

afterEach(cleanup);

const items = [
  { label: 'Home', href: '/home' },
  { label: 'Products', content: <div>Products flyout</div> },
  { label: 'Company', content: <div>Company flyout</div> },
];

describe('NavigationMenu', () => {
  it('renders a plain link for an item with no content', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.getAttribute('href')).toBe('/home');
  });

  it('renders a toggle trigger for an item with content, collapsed by default', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    expect(screen.getByRole('button', { name: 'Products' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('opens a flyout on trigger click', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(screen.getByText('Products flyout')).toBeDefined();
  });

  it('closes on a second click of the same trigger', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    const trigger = screen.getByRole('button', { name: 'Products' });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByText('Products flyout')).toBeNull();
  });

  it('switches directly to a sibling on hover once one flyout is already open', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    fireEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(screen.getByText('Products flyout')).toBeDefined();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByText('Company flyout')).toBeDefined();
    expect(screen.queryByText('Products flyout')).toBeNull();
  });

  it('does not open a flyout on hover alone when nothing else is open', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Products' }));
    expect(screen.queryByText('Products flyout')).toBeNull();
  });

  it('ArrowRight/ArrowLeft move focus between top-level triggers', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    const products = screen.getByRole('button', { name: 'Products' });
    const company = screen.getByRole('button', { name: 'Company' });
    products.focus();
    fireEvent.keyDown(products, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(company);
    fireEvent.keyDown(company, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(products);
  });

  it('Escape closes the open flyout and returns focus to its trigger', () => {
    render(<NavigationMenu items={items} aria-label="Main" />);
    const trigger = screen.getByRole('button', { name: 'Products' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByText('Products flyout')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses a caller-supplied renderLink for plain links instead of a bare <a>', () => {
    render(
      <NavigationMenu
        items={items}
        aria-label="Main"
        renderLink={(href, children) => (
          <button type="button" data-href={href}>
            {children}
          </button>
        )}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveProperty('dataset.href', '/home');
  });
});
