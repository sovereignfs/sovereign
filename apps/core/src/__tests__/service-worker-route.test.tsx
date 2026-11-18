// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_WORKER_SOURCE, TAKE_OVER_MESSAGE } from '../sw/source';

const { GET } = await import('../../app/sw.js/route');
const { ServiceWorkerRegistration } = await import('../../app/service-worker-registration');

describe('/sw.js', () => {
  it('is the worker, as script, fetched afresh every time, for the whole origin', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SERVICE_WORKER_SOURCE);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('service-worker-allowed')).toBe('/');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

/** A stand-in for a registration: an event target with the workers it may hold. */
function registration(workers: { waiting?: unknown; installing?: unknown } = {}) {
  return Object.assign(new EventTarget(), {
    waiting: null,
    installing: null,
    update: vi.fn(() => Promise.resolve()),
    ...workers,
  });
}

describe('registering the service worker', () => {
  const register = vi.fn();
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

  it('registers it for the whole origin, never from the browser’s own cache, in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<ServiceWorkerRegistration appName="Acme" />);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('does not register in development, where a worker would stand between a page and its hot reload', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<ServiceWorkerRegistration appName="Acme" />);
    expect(register).not.toHaveBeenCalled();
  });

  it('does not register outside a secure context, which a worker needs', () => {
    vi.stubEnv('NODE_ENV', 'production');
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    render(<ServiceWorkerRegistration appName="Acme" />);
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing, and does not fail, in a browser without service workers', () => {
    vi.stubEnv('NODE_ENV', 'production');
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect(() => render(<ServiceWorkerRegistration appName="Acme" />)).not.toThrow();
  });

  it('is not troubled by a refusal', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    register.mockRejectedValue(new Error('refused'));
    render(<ServiceWorkerRegistration appName="Acme" />);
    await Promise.resolve();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('says a new version is ready when one waits, and has it take over on Reload', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const waiting = { postMessage: vi.fn() };
    register.mockResolvedValue(registration({ waiting }));
    Object.assign(navigator.serviceWorker, { controller: {} });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });
    render(<ServiceWorkerRegistration appName="Acme" />);
    await act(() => Promise.resolve());
    expect(screen.getByRole('status').textContent).toContain('A new version of Acme is ready.');

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(waiting.postMessage).toHaveBeenCalledWith(TAKE_OVER_MESSAGE);
    expect(reload).not.toHaveBeenCalled();
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('says nothing on a first visit, when no worker controlled the page before', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    register.mockResolvedValue(registration({ waiting: { postMessage: vi.fn() } }));
    render(<ServiceWorkerRegistration appName="Acme" />);
    await act(() => Promise.resolve());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('puts the notice off when asked, until the next page', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    register.mockResolvedValue(registration({ waiting: { postMessage: vi.fn() } }));
    Object.assign(navigator.serviceWorker, { controller: {} });
    render(<ServiceWorkerRegistration appName="Acme" />);
    await act(() => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
