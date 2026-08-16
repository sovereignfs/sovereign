// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MobileFooter } from '../MobileFooter';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const oneIcon = [{ icon: <span>icon</span>, label: 'Home' }];
const twoIcons = [
  { icon: <span>icon</span>, label: 'Home' },
  { icon: <span>icon</span>, label: 'Calendar' },
];
const leftTwo = [
  { icon: <span>icon</span>, label: 'Home' },
  { icon: <span>icon</span>, label: 'Calendar' },
];
const rightTwo = [
  { icon: <span>icon</span>, label: 'Search' },
  { icon: <span>icon</span>, label: 'Activity' },
];

describe('MobileFooter self-measured height', () => {
  afterEach(() => {
    document.getElementById('sv-app-shell')?.remove();
  });

  it('publishes its rendered height as --sv-shell-footer-height on #sv-app-shell', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 64,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect);

    render(<MobileFooter onOpenApps={() => {}} leftIcons={oneIcon} rightIcons={oneIcon} />);

    expect(shell.style.getPropertyValue('--sv-shell-footer-height')).toBe('64px');
  });

  it('removes the override on unmount', () => {
    const shell = document.createElement('div');
    shell.id = 'sv-app-shell';
    document.body.appendChild(shell);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 64,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect);

    const { unmount } = render(
      <MobileFooter onOpenApps={() => {}} leftIcons={oneIcon} rightIcons={oneIcon} />,
    );
    expect(shell.style.getPropertyValue('--sv-shell-footer-height')).toBe('64px');

    unmount();
    expect(shell.style.getPropertyValue('--sv-shell-footer-height')).toBe('');
  });

  it('never throws when #sv-app-shell is absent (Storybook, unit tests, other hosts)', () => {
    expect(() =>
      render(<MobileFooter onOpenApps={() => {}} leftIcons={oneIcon} rightIcons={oneIcon} />),
    ).not.toThrow();
  });
});

describe('MobileFooter', () => {
  it('always renders the centered launcher button', () => {
    render(<MobileFooter onOpenApps={() => {}} leftIcons={oneIcon} rightIcons={oneIcon} />);

    expect(screen.getByRole('button', { name: 'Apps' })).toBeDefined();
  });

  it('calls onOpenApps when the launcher is pressed', () => {
    const onOpenApps = vi.fn();
    render(<MobileFooter onOpenApps={onOpenApps} leftIcons={oneIcon} rightIcons={oneIcon} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));
    expect(onOpenApps).toHaveBeenCalledTimes(1);
  });

  it('renders 1+1 and 2+2 icon layouts', () => {
    const { rerender } = render(
      <MobileFooter onOpenApps={() => {}} leftIcons={oneIcon} rightIcons={oneIcon} />,
    );
    expect(screen.getAllByRole('button').length).toBe(3);

    rerender(<MobileFooter onOpenApps={() => {}} leftIcons={leftTwo} rightIcons={rightTwo} />);
    expect(screen.getByLabelText('Calendar')).toBeDefined();
    expect(screen.getByLabelText('Activity')).toBeDefined();
  });

  it('logs a dev-mode console.error when left/right icon counts mismatch, but never throws', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(<MobileFooter onOpenApps={() => {}} leftIcons={oneIcon} rightIcons={twoIcons} />),
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('leftIcons'));
  });

  it('does not call console.error in production even with mismatched counts', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<MobileFooter onOpenApps={() => {}} leftIcons={oneIcon} rightIcons={twoIcons} />);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
