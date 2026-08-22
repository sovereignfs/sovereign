// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { usePublishShellChromeHeight } from '../usePublishShellChromeHeight';

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  usePublishShellChromeHeight(ref, '--sv-shell-footer-height');
  return <div ref={ref} />;
}

function HeaderHarness() {
  const ref = useRef<HTMLDivElement>(null);
  usePublishShellChromeHeight(ref, '--sv-shell-header-height');
  return <div ref={ref} />;
}

function stubHeight(height: number) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    height,
    width: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect);
}

describe('usePublishShellChromeHeight', () => {
  afterEach(() => {
    cleanup();
    document.getElementById('sv-app-shell')?.remove();
    vi.restoreAllMocks();
  });

  it('re-measures on window resize', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    const rectSpy = stubHeight(50);

    render(<Harness />);
    expect(shell.style.getPropertyValue('--sv-shell-footer-height')).toBe('50px');

    rectSpy.mockReturnValue({
      height: 80,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect);
    act(() => window.dispatchEvent(new Event('resize')));

    expect(shell.style.getPropertyValue('--sv-shell-footer-height')).toBe('80px');
  });

  it('removes its resize listener on unmount', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    stubHeight(50);
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<Harness />);
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('is a no-op when #sv-app-shell does not exist', () => {
    stubHeight(50);
    expect(() => render(<Harness />)).not.toThrow();
  });

  it('also mirrors --sv-shell-header-height onto --sv-dialog-inset-top on :root', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    stubHeight(69);

    render(<HeaderHarness />);

    expect(shell.style.getPropertyValue('--sv-shell-header-height')).toBe('69px');
    expect(document.documentElement.style.getPropertyValue('--sv-dialog-inset-top')).toBe('69px');
  });

  it('removes --sv-dialog-inset-top from :root on unmount', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    stubHeight(69);

    const { unmount } = render(<HeaderHarness />);
    expect(document.documentElement.style.getPropertyValue('--sv-dialog-inset-top')).toBe('69px');

    unmount();
    expect(document.documentElement.style.getPropertyValue('--sv-dialog-inset-top')).toBe('');
  });

  it('never touches --sv-dialog-inset-top for the footer variable', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    stubHeight(50);

    render(<Harness />);

    expect(document.documentElement.style.getPropertyValue('--sv-dialog-inset-top')).toBe('');
  });
});
