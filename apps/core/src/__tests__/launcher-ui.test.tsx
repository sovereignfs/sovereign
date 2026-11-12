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
    render(<Launcher title="Apps" subtitle="Choose an app." apps={APPS} canAddApps={false} />);
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
        title="Apps"
        subtitle="Choose an app."
        apps={[app('Notes'), app('Photos', { icon: 'https://i.example/p.png' })]}
        canAddApps={false}
      />,
    );
    expect(screen.getByLabelText('Notes').textContent).toBe('NO');
    expect(screen.getByAltText('Photos').getAttribute('src')).toBe('https://i.example/p.png');
  });

  it('falls back to the drawn icon when the picture will not load', () => {
    render(
      <Launcher
        title="Apps"
        subtitle="Choose an app."
        apps={[app('Photos', { icon: 'https://i.example/p.png' })]}
        canAddApps={false}
      />,
    );
    fireEvent.error(screen.getByAltText('Photos'));
    expect(screen.getByLabelText('Photos').textContent).toBe('PH');
  });

  it('narrows the list as the name is typed, whatever the case, and brings it all back when cleared', () => {
    render(<Launcher title="Apps" subtitle="Choose an app." apps={APPS} canAddApps={false} />);
    const search = screen.getByRole('searchbox', { name: 'Search apps' });
    fireEvent.change(search, { target: { value: '  NOT' } });
    expect(screen.getByRole('link', { name: /Notes/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Calendar/ })).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('searches by name, not by description', () => {
    render(<Launcher title="Apps" subtitle="Choose an app." apps={APPS} canAddApps={false} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'week' } });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('says so, naming what was searched for, when nothing matches', () => {
    render(<Launcher title="Apps" subtitle="Choose an app." apps={APPS} canAddApps={false} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByRole('status').textContent).toBe('No app is called “zzz”.');
  });

  it('has no search box when there is nothing to search, and says what to do', () => {
    render(<Launcher title="Apps" subtitle="Choose an app." apps={[]} canAddApps />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('link', { name: 'Add an app' }).getAttribute('href')).toBe(
      '/console/apps/new',
    );
  });

  it('does not send someone who cannot add apps to a page that is not there for them', () => {
    render(<Launcher title="Apps" subtitle="Choose an app." apps={[]} canAddApps={false} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Ask whoever runs it/)).toBeTruthy();
  });

  it('has the Console first, as a platform app, for an operator, and marks every other tile as a Sovereign app', () => {
    render(
      <Launcher
        title="Apps"
        subtitle="Choose an app."
        apps={APPS}
        canAddApps={false}
        canOpenConsole
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[0]?.getAttribute('href')).toBe('/console');
    expect(links[0]?.textContent).toContain('Console');
    expect(links[0]?.textContent).toContain('platform');
    expect(screen.getAllByText('sovereign')).toHaveLength(3);
    expect(screen.getAllByText('platform')).toHaveLength(1);
  });

  it('has no Console for someone who cannot open it', () => {
    render(<Launcher title="Apps" subtitle="Choose an app." apps={APPS} canAddApps={false} />);
    expect(screen.queryByRole('link', { name: /Console/ })).toBeNull();
    expect(screen.queryByText('platform')).toBeNull();
  });

  it('finds the Console by name too, and still shows it when no app has been added', () => {
    const { rerender } = render(
      <Launcher
        title="Apps"
        subtitle="Choose an app."
        apps={APPS}
        canAddApps={false}
        canOpenConsole
      />,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cons' } });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    rerender(
      <Launcher title="Apps" subtitle="Choose an app." apps={[]} canAddApps canOpenConsole />,
    );
    expect(screen.getByRole('link', { name: /Console/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Add an app/ }).getAttribute('href')).toBe(
      '/console/apps/new',
    );
  });

  it('offers adding an app as a dashed tile after the others, only to those who may, and not while searching', () => {
    const { rerender } = render(
      <Launcher title="Apps" subtitle="Choose an app." apps={APPS} canAddApps />,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[3]?.textContent).toContain('Add an app');
    expect(links[3]?.className).toContain('ghost');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'not' } });
    expect(screen.queryByRole('link', { name: /Add an app/ })).toBeNull();
    rerender(<Launcher title="Apps" subtitle="Choose an app." apps={APPS} canAddApps={false} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.queryByRole('link', { name: /Add an app/ })).toBeNull();
  });

  it('puts the heading and its line beside the search, and shows no search when there is nothing to search', () => {
    const { rerender } = render(
      <Launcher title="Apps" subtitle="You are signed in." apps={APPS} canAddApps={false} />,
    );
    expect(screen.getByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByText('You are signed in.')).toBeTruthy();
    expect(screen.getByRole('searchbox')).toBeTruthy();
    rerender(<Launcher title="Apps" subtitle="You are signed in." apps={[]} canAddApps={false} />);
    expect(screen.getByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
