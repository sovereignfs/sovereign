// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../Resizable';

afterEach(cleanup);

describe('ResizablePanelGroup', () => {
  it('renders each panel and a separator between them', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>
          <p>Left</p>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize sidebar" />
        <ResizablePanel>
          <p>Right</p>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    expect(screen.getByText('Left')).toBeDefined();
    expect(screen.getByText('Right')).toBeDefined();
    expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toBeDefined();
  });

  it('splits panels evenly by default', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>
          <p>Left</p>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize" />
        <ResizablePanel>
          <p>Right</p>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    const separator = screen.getByRole('separator', { name: 'Resize' });
    expect(separator.getAttribute('aria-valuenow')).toBe('50');
  });

  it('resizes the pair of neighboring panels with the keyboard, redistributing their combined size', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50} minSize={20} maxSize={80}>
          <p>Left</p>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize" />
        <ResizablePanel defaultSize={50} minSize={20} maxSize={80}>
          <p>Right</p>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    const separator = screen.getByRole('separator', { name: 'Resize' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator.getAttribute('aria-valuenow')).toBe('55');

    fireEvent.keyDown(separator, { key: 'ArrowLeft', shiftKey: true });
    expect(separator.getAttribute('aria-valuenow')).toBe('45');
  });

  it('clamps keyboard resizing to minSize/maxSize', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50} minSize={45} maxSize={55}>
          <p>Left</p>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize" />
        <ResizablePanel defaultSize={50} minSize={45} maxSize={55}>
          <p>Right</p>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    const separator = screen.getByRole('separator', { name: 'Resize' });
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true });
    expect(separator.getAttribute('aria-valuenow')).toBe('55');
  });

  it('only affects the pair of panels adjacent to the handle that moved', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={34}>
          <p>A</p>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize A-B" />
        <ResizablePanel defaultSize={33}>
          <p>B</p>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize B-C" />
        <ResizablePanel defaultSize={33}>
          <p>C</p>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    const first = screen.getByRole('separator', { name: 'Resize A-B' });
    const second = screen.getByRole('separator', { name: 'Resize B-C' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second.getAttribute('aria-valuenow')).toBe('28');
  });

  it('uses ArrowDown/ArrowUp for vertical groups instead of ArrowRight/ArrowLeft', () => {
    render(
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel defaultSize={50}>
          <p>Top</p>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize" />
        <ResizablePanel defaultSize={50}>
          <p>Bottom</p>
        </ResizablePanel>
      </ResizablePanelGroup>,
    );

    const separator = screen.getByRole('separator', { name: 'Resize' });
    expect(separator.getAttribute('aria-orientation')).toBe('horizontal');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator.getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(separator.getAttribute('aria-valuenow')).toBe('55');
  });
});
