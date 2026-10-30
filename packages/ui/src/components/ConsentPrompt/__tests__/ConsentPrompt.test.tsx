// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConsentPrompt } from '../ConsentPrompt';

afterEach(cleanup);

const base = {
  consumerName: 'Notes',
  providerName: 'Photos',
  contract: 'the album list',
  onAllow: () => {},
};

describe('ConsentPrompt', () => {
  it('says who wants to read what from whom', () => {
    const { container } = render(<ConsentPrompt {...base} />);
    expect(container.textContent).toContain('Notes wants to read the album list from Photos');
  });

  it('shows the description when there is one', () => {
    render(<ConsentPrompt {...base} description="So it can link your albums." />);
    expect(screen.getByText('So it can link your albums.')).toBeDefined();
    cleanup();
    render(<ConsentPrompt {...base} description={null} />);
    expect(screen.queryByText('So it can link your albums.')).toBeNull();
  });

  it('allows with the default label, and offers no refusal unless there is a handler', () => {
    const onAllow = vi.fn();
    render(<ConsentPrompt {...base} onAllow={onAllow} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(onAllow).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
  });

  it('refuses with its own label when there is a handler', () => {
    const onDeny = vi.fn();
    render(<ConsentPrompt {...base} onDeny={onDeny} allowLabel="Yes" denyLabel="No" />);
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onDeny).toHaveBeenCalledOnce();
  });

  it('disables both actions while pending', () => {
    const onAllow = vi.fn();
    const onDeny = vi.fn();
    render(<ConsentPrompt {...base} onAllow={onAllow} onDeny={onDeny} pending />);
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(onAllow).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
  });
});
