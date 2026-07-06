// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitPane } from '../SplitPane';

afterEach(cleanup);

describe('SplitPane', () => {
  it('renders labeled panes and a resize button', () => {
    render(
      <SplitPane
        primary={<p>Editor</p>}
        secondary={<p>Preview</p>}
        primaryLabel="Editor pane"
        secondaryLabel="Preview pane"
      />,
    );

    expect(screen.getByRole('region', { name: 'Editor pane' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Preview pane' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Resize panes/ })).toBeDefined();
  });

  it('omits the resize button when not resizable', () => {
    render(<SplitPane primary={<p>List</p>} secondary={<p>Detail</p>} resizable={false} />);

    expect(screen.queryByRole('button', { name: /Resize panes/ })).toBeNull();
  });

  it('resizes with keyboard controls', () => {
    render(
      <SplitPane
        primary={<p>Editor</p>}
        secondary={<p>Preview</p>}
        defaultPrimarySize={50}
        minPrimarySize={30}
        maxPrimarySize={70}
      />,
    );

    const separator = screen.getByRole('button', { name: /Resize panes/ });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator.getAttribute('aria-label')).toContain('55 percent');

    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator.getAttribute('aria-label')).toContain('30 percent');

    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator.getAttribute('aria-label')).toContain('70 percent');
  });
});
