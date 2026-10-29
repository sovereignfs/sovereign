// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_WORKER_SOURCE } from '../sw/source';

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

describe('registering the service worker', () => {
  const register = vi.fn();
  beforeEach(() => {
    register.mockReset().mockResolvedValue({});
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('registers it for the whole origin, never from the browser’s own cache, in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<ServiceWorkerRegistration />);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('does not register in development, where a worker would stand between a page and its hot reload', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<ServiceWorkerRegistration />);
    expect(register).not.toHaveBeenCalled();
  });

  it('does not register outside a secure context, which a worker needs', () => {
    vi.stubEnv('NODE_ENV', 'production');
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    render(<ServiceWorkerRegistration />);
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing, and does not fail, in a browser without service workers', () => {
    vi.stubEnv('NODE_ENV', 'production');
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
  });

  it('is not troubled by a refusal', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    register.mockRejectedValue(new Error('refused'));
    render(<ServiceWorkerRegistration />);
    await Promise.resolve();
    expect(register).toHaveBeenCalledTimes(1);
  });
});
