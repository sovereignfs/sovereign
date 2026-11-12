// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhotoGallery, PhotoGrid } from '../PhotoGrid';
import { type Photo, PhotoViewer } from '../PhotoViewer';

// jsdom has no matchMedia, which the viewer's exit animation reads (as Dialog's does).
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const photos: Photo[] = [
  {
    id: 'a',
    src: 'https://photos.example/a.jpg',
    alt: 'A harbour at dusk',
    caption: 'Lisbon, 3 May',
  },
  { id: 'b', src: 'blob:https://app.example/1234', alt: 'A tram on a hill' },
  {
    id: 'c',
    src: '/media/c',
    thumbSrc: '/media/c/thumb',
    alt: 'A bakery window',
    caption: <em>Fresh</em>,
  },
];

function Harness({ start = 0, onClose = () => {} }: { start?: number; onClose?: () => void }) {
  const [index, setIndex] = useState(start);
  return (
    <PhotoViewer photos={photos} open index={index} onIndexChange={setIndex} onClose={onClose} />
  );
}

beforeEach(installMatchMedia);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

describe('PhotoViewer', () => {
  it('is a modal dialog showing the photo, its place in the list and its caption', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Photos' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('img', { name: 'A harbour at dusk' }).getAttribute('src')).toBe(
      'https://photos.example/a.jpg',
    );
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('Lisbon, 3 May')).toBeTruthy();
  });

  it('renders nothing while closed, or with no photos', () => {
    const { rerender } = render(
      <PhotoViewer
        photos={photos}
        open={false}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <PhotoViewer photos={[]} open index={0} onIndexChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves between photos with the buttons and the arrow, home and end keys', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'A tram on a hill' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText('3 of 3')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByText('2 of 3')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Home' });
    expect(screen.getByText('1 of 3')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'End' });
    expect(screen.getByText('3 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('has no previous at the first photo, no next at the last, and stops at the ends', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Previous photo' })).toBeNull();
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByText('1 of 3')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'End' });
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText('3 of 3')).toBeTruthy();
  });

  it('shows a photo from a blob: address as it is given, and only the addresses it is given', () => {
    render(<Harness start={1} />);
    expect(screen.getByRole('img', { name: 'A tram on a hill' }).getAttribute('src')).toBe(
      'blob:https://app.example/1234',
    );
    const srcs = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['blob:https://app.example/1234']);
  });

  it('closes with Escape and with the close button', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('moves focus into the viewer when it opens', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('says so when a photo cannot be shown, and shows the next one normally', () => {
    render(<Harness />);
    fireEvent.error(screen.getByRole('img', { name: 'A harbour at dusk' }));
    expect(screen.getByRole('status').textContent).toContain('could not be shown');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('img', { name: 'A tram on a hill' })).toBeTruthy();
  });

  it('locks the page’s scroll while it is open, and lets go when it is closed', () => {
    const { rerender } = render(
      <PhotoViewer photos={photos} open index={0} onIndexChange={() => {}} onClose={() => {}} />,
    );
    expect(document.body.style.overflowY).toBe('hidden');
    vi.useFakeTimers();
    rerender(
      <PhotoViewer
        photos={photos}
        open={false}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(document.body.style.overflowY).toBe('');
  });
});

describe('PhotoGrid and PhotoGallery', () => {
  it('lists a button for each photo, named by what it shows and where it is', () => {
    const onOpen = vi.fn();
    render(<PhotoGrid photos={photos} onOpen={onOpen} />);
    expect(screen.getByRole('list', { name: 'Photos' })).toBeTruthy();
    const second = screen.getByRole('button', { name: 'Photo 2 of 3: A tram on a hill' });
    fireEvent.click(second);
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('uses the small picture for the thumbnail when there is one', () => {
    render(<PhotoGrid photos={photos} onOpen={() => {}} />);
    const srcs = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual([
      'https://photos.example/a.jpg',
      'blob:https://app.example/1234',
      '/media/c/thumb',
    ]);
  });

  it('renders nothing for no photos', () => {
    const { container } = render(<PhotoGrid photos={[]} onOpen={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the viewer on the photo chosen, and gives focus back to the thumbnail when it closes', () => {
    vi.useFakeTimers();
    const onView = vi.fn();
    render(<PhotoGallery photos={photos} onView={onView} />);
    const thumb = screen.getByRole('button', { name: 'Photo 3 of 3: A bakery window' });
    thumb.focus();
    fireEvent.click(thumb);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByText('3 of 3')).toBeTruthy();
    expect(onView).toHaveBeenLastCalledWith(2);
    expect(document.activeElement).not.toBe(thumb);
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(thumb);
  });
});
