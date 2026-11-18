// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceWorkerRegistration } from '../client';
import { TAKE_OVER_MESSAGE } from '../message';

const register = vi.fn();
const registration = (workers: { waiting?: unknown } = {}) =>
  Object.assign(new EventTarget(), {
    waiting: null,
    installing: null,
    update: vi.fn(() => Promise.resolve()),
    ...workers,
  });

beforeEach(() => {
  register.mockReset().mockResolvedValue(registration());
  Object.defineProperty(navigator, 'serviceWorker', {
    value: Object.assign(new EventTarget(), { register, controller: null }),
    configurable: true,
  });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('ServiceWorkerRegistration', () => {
  it('registers the worker for the whole origin, never from the browser’s cache, in production only', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<ServiceWorkerRegistration appName="Notes" />);
    expect(register).not.toHaveBeenCalled();
    cleanup();
    vi.stubEnv('NODE_ENV', 'production');
    render(<ServiceWorkerRegistration appName="Notes" />);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('does not register outside a secure context', () => {
    vi.stubEnv('NODE_ENV', 'production');
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    render(<ServiceWorkerRegistration appName="Notes" />);
    expect(register).not.toHaveBeenCalled();
  });

  it('announces a waiting version and has it take over on Reload', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const waiting = { postMessage: vi.fn() };
    register.mockResolvedValue(registration({ waiting }));
    Object.assign(navigator.serviceWorker, { controller: {} });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });
    render(<ServiceWorkerRegistration appName="Notes" />);
    await act(() => Promise.resolve());
    expect(screen.getByRole('status').textContent).toContain('A new version of Notes is ready.');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(waiting.postMessage).toHaveBeenCalledWith(TAKE_OVER_MESSAGE);
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('says nothing on a first visit, when no worker controlled the page', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    register.mockResolvedValue(registration({ waiting: { postMessage: vi.fn() } }));
    render(<ServiceWorkerRegistration appName="Notes" />);
    await act(() => Promise.resolve());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
