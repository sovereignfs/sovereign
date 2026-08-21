// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Avatar } from '../Avatar';

afterEach(cleanup);

describe('Avatar', () => {
  it('renders initials from a two-word name', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText('AL')).toBeDefined();
  });

  it('renders initials from a single-word name', () => {
    render(<Avatar name="Cher" />);
    expect(screen.getByText('CH')).toBeDefined();
  });

  it('exposes the name as an accessible label', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByLabelText('Ada Lovelace')).toBeDefined();
  });

  it('renders an image when src is provided', () => {
    render(<Avatar name="Ada Lovelace" src="/ada.png" />);
    const img = screen.getByAltText('Ada Lovelace') as HTMLImageElement;
    expect(img.src).toContain('/ada.png');
  });

  it('applies the size class', () => {
    render(<Avatar name="Ada Lovelace" size="lg" />);
    expect(screen.getByLabelText('Ada Lovelace').className).toContain('lg');
  });

  it('defaults to the md size class', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByLabelText('Ada Lovelace').className).toContain('md');
  });
});
