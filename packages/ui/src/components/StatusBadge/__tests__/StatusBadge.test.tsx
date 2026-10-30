// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusBadge, type StatusBadgeStatus } from '../StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  const labels: [StatusBadgeStatus, string][] = [
    ['unmodified', 'Unmodified'],
    ['draft', 'Draft'],
    ['committed', 'Committed'],
    ['conflict', 'Conflict'],
    ['pending-delete', 'Pending delete'],
    ['synced', 'Synced'],
    ['warning', 'Warning'],
    ['error', 'Error'],
  ];

  it.each(labels)('says %s in words when it is given none', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeDefined();
  });

  it('uses the words it is given instead', () => {
    render(<StatusBadge status="warning">Switched off</StatusBadge>);
    expect(screen.getByText('Switched off')).toBeDefined();
    expect(screen.queryByText('Warning')).toBeNull();
  });

  it('colours each status by what it means, not by its name', () => {
    const tone = (status: StatusBadgeStatus) => {
      render(<StatusBadge status={status}>x</StatusBadge>);
      const className = screen.getByText('x').parentElement?.className ?? '';
      cleanup();
      return className;
    };
    expect(tone('synced')).toContain('success');
    expect(tone('committed')).toContain('success');
    expect(tone('error')).toContain('error');
    expect(tone('conflict')).toContain('error');
    expect(tone('warning')).toContain('warning');
    expect(tone('pending-delete')).toContain('warning');
    expect(tone('draft')).toContain('info');
    expect(tone('unmodified')).toContain('neutral');
  });

  it('hides its dot from assistive technology, and can be given a name of its own', () => {
    const { container } = render(
      <StatusBadge status="synced" aria-label="Sync is up to date" className="mine" />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    const badge = screen.getByLabelText('Sync is up to date');
    expect(badge.className).toContain('mine');
  });
});
