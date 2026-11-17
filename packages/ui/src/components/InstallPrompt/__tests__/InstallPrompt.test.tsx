// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallHint, InstallPrompt } from '../InstallPrompt';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';
const CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

function device({ ua = CHROME, standalone = false } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  window.matchMedia = vi.fn((query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
  })) as unknown as typeof window.matchMedia;
}

/** A stand-in for Chromium's `beforeinstallprompt`. */
function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InstallHint', () => {
  it('offers the browser’s prompt and a way to say not now', () => {
    const onInstall = vi.fn();
    const onDismiss = vi.fn();
    render(
      <InstallHint appName="Acme" kind="prompt" onInstall={onInstall} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onInstall).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('on an iPhone says how, since Safari has no prompt', () => {
    render(<InstallHint appName="Acme" kind="ios" onDismiss={() => undefined} />);
    expect(screen.getByText(/tap Share, then Add to Home Screen/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});

describe('InstallPrompt', () => {
  it('shows nothing until the browser says the site can be installed', () => {
    device();
    render(<InstallPrompt appName="Acme" />);
    expect(screen.queryByRole('region')).toBeNull();
    const event = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('region', { name: 'Install Acme' })).toBeDefined();
  });

  it('opens the browser’s own prompt, and goes away after it', async () => {
    device();
    render(<InstallPrompt appName="Acme" />);
    const event = offerInstall('accepted');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
      await Promise.resolve();
    });
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('says how on an iPhone in Safari', () => {
    device({ ua: IPHONE });
    render(<InstallPrompt appName="Acme" />);
    expect(screen.getByText(/Add to Home Screen/)).toBeDefined();
  });

  it('shows nothing in an installed window', () => {
    device({ ua: IPHONE, standalone: true });
    render(<InstallPrompt appName="Acme" />);
    offerInstall();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('remembers Not now on this device', () => {
    device({ ua: IPHONE });
    const { unmount } = render(<InstallPrompt appName="Acme" />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region')).toBeNull();
    unmount();
    render(<InstallPrompt appName="Acme" />);
    expect(screen.queryByRole('region')).toBeNull();
  });
});
