// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateNotice } from '../UpdateNotice';

afterEach(cleanup);

describe('UpdateNotice', () => {
  it('says a new version is ready, politely, and reloads when asked', () => {
    const onReload = vi.fn();
    render(<UpdateNotice appName="Acme" onReload={onReload} />);
    expect(screen.getByRole('status').textContent).toContain('A new version of Acme is ready.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
  });

  it('offers Later only when it can be put off', () => {
    const onDismiss = vi.fn();
    render(<UpdateNotice appName="Acme" onReload={() => undefined} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('cannot be pressed twice while the new version takes over', () => {
    render(<UpdateNotice appName="Acme" onReload={() => undefined} reloading />);
    expect((screen.getByRole('button', { name: 'Reloading…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
