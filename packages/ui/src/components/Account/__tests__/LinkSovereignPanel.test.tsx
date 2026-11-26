// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillUnannounced } from '../../../__tests__/fill-unannounced';
import { LinkSovereignPanel } from '../LinkSovereignPanel';

afterEach(cleanup);

describe('LinkSovereignPanel', () => {
  it('hands over the password, and sends nothing itself', () => {
    const onSubmit = vi.fn();
    render(<LinkSovereignPanel linked={false} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'pw' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Link to Sovereign' }));
    expect(onSubmit).toHaveBeenCalledWith({ password: 'pw' });
  });

  it('hands over what is in the box when it was filled without a word to the page, and leaves it there', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<LinkSovereignPanel linked={false} onSubmit={onSubmit} />);
    const box = () => screen.getByLabelText(/Password/) as HTMLInputElement;
    fillUnannounced(box(), 'pw');
    fireEvent.submit(screen.getByRole('button', { name: 'Link to Sovereign' }));
    expect(onSubmit).toHaveBeenCalledWith({ password: 'pw' });
    rerender(<LinkSovereignPanel linked={false} pending onSubmit={onSubmit} />);
    expect(box().value).toBe('pw');
  });

  it('says why nothing was linked, in the instance’s name', () => {
    render(
      <LinkSovereignPanel
        linked={false}
        instanceName="Home"
        outcome="taken"
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'That Home account already signs in to another account here',
    );
  });

  it('offers nothing to an account already linked', () => {
    render(<LinkSovereignPanel linked onSubmit={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/signs in through Sovereign too/)).toBeTruthy();
  });
});
