// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LauncherApp } from '../clients/launcher';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { Launcher } = await import('../../app/launcher');

afterEach(cleanup);

const app = (name: string, extra: Partial<LauncherApp> = {}): LauncherApp => ({
  id: name.toLowerCase(),
  name,
  description: undefined,
  icon: undefined,
  launchUrl: `https://${name.toLowerCase()}.example`,
  ...extra,
});
const APPS = [app('Calendar', { description: 'Plan the week' }), app('Notes'), app('Photos')];

describe('the launcher', () => {
  it('shows every app as a link to its launch address, in the same tab', () => {
    render(<Launcher apps={APPS} canAddApps={false} />);
    for (const { name, launchUrl } of APPS) {
      const link = screen.getByRole('link', { name: new RegExp(name) });
      expect(link.getAttribute('href')).toBe(launchUrl);
      expect(link.getAttribute('target')).toBeNull();
    }
    expect(screen.getByText('Plan the week')).toBeTruthy();
  });

  it('draws an icon from the name when there is none, and uses the app’s own when there is', () => {
    render(
      <Launcher
        apps={[app('Notes'), app('Photos', { icon: 'https://i.example/p.png' })]}
        canAddApps={false}
      />,
    );
    expect(screen.getByLabelText('Notes').textContent).toBe('NO');
    expect(screen.getByAltText('Photos').getAttribute('src')).toBe('https://i.example/p.png');
  });

  it('falls back to the drawn icon when the picture will not load', () => {
    render(
      <Launcher apps={[app('Photos', { icon: 'https://i.example/p.png' })]} canAddApps={false} />,
    );
    fireEvent.error(screen.getByAltText('Photos'));
    expect(screen.getByLabelText('Photos').textContent).toBe('PH');
  });

  it('narrows the list as the name is typed, whatever the case, and brings it all back when cleared', () => {
    render(<Launcher apps={APPS} canAddApps={false} />);
    const search = screen.getByRole('searchbox', { name: 'Search apps' });
    fireEvent.change(search, { target: { value: '  NOT' } });
    expect(screen.getByRole('link', { name: /Notes/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Calendar/ })).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('searches by name, not by description', () => {
    render(<Launcher apps={APPS} canAddApps={false} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'week' } });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('says so, naming what was searched for, when nothing matches', () => {
    render(<Launcher apps={APPS} canAddApps={false} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByRole('status').textContent).toBe('No app is called “zzz”.');
  });

  it('has no search box when there is nothing to search, and says what to do', () => {
    render(<Launcher apps={[]} canAddApps />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('link', { name: 'Add an app' }).getAttribute('href')).toBe(
      '/console/apps/new',
    );
  });

  it('does not send someone who cannot add apps to a page that is not there for them', () => {
    render(<Launcher apps={[]} canAddApps={false} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Ask whoever runs it/)).toBeTruthy();
  });
});
