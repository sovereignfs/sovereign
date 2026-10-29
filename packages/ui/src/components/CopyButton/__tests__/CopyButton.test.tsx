// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CopyButton } from '../CopyButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CopyButton', () => {
  it('puts the text on the clipboard when pressed, and says it was copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton text="abc123" label="Copy" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeDefined();
    expect(writeText).toHaveBeenCalledWith('abc123');
  });

  it('says so when the browser will not let it, rather than pretending', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });
    render(<CopyButton text="abc123" label="Copy" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Could not copy' })).toBeDefined();
  });

  it('does not touch the clipboard until it is pressed', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<CopyButton text="abc123" label="Copy" />);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('uses the labels it is given', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CopyButton text="x" label="Copy ID" copiedLabel="ID copied" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy ID' }));
    expect(await screen.findByRole('button', { name: 'ID copied' })).toBeDefined();
  });

  it('is a button that does not submit a form it is inside', () => {
    render(
      <form>
        <CopyButton text="x" label="Copy" />
      </form>,
    );
    expect(screen.getByRole('button', { name: 'Copy' }).getAttribute('type')).toBe('button');
  });
});
