'use client';

import { useState } from 'react';
import { PhotoViewer, type Photo } from './PhotoViewer';
import styles from './PhotoGrid.module.css';

export interface PhotoGridProps {
  photos: readonly Photo[];
  /** Called with the index of the thumbnail that was chosen. */
  onOpen: (index: number) => void;
  /** Names the grid for assistive technology. Default "Photos". */
  label?: string;
  className?: string;
}

/** A grid of thumbnails, each a button that opens that photo. A thumbnail is named by what its photo shows and where it is in the list ("Photo 2 of 9: …"). */
export function PhotoGrid({ photos, onOpen, label = 'Photos', className }: PhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <ul className={[styles.grid, className].filter(Boolean).join(' ')} aria-label={label}>
      {photos.map((photo, index) => (
        <li key={photo.id} className={styles.cell}>
          <button
            type="button"
            className={styles.thumb}
            aria-label={`Photo ${index + 1} of ${photos.length}: ${photo.alt}`}
            onClick={() => onOpen(index)}
          >
            <img
              src={photo.thumbSrc ?? photo.src}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className={styles.img}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface PhotoGalleryProps extends Omit<PhotoGridProps, 'onOpen'> {
  /** Called as the viewer moves from photo to photo, for an app that keeps track. */
  onView?: (index: number) => void;
}

/**
 * The grid and the viewer together, for the usual case: choosing a thumbnail opens the viewer on that photo, and closing it **returns focus to that thumbnail**. An app that needs to control the
 * viewer itself (to open it from somewhere else, say) uses `PhotoGrid` and `PhotoViewer` directly.
 */
export function PhotoGallery({ photos, label, className, onView }: PhotoGalleryProps) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  return (
    <>
      <PhotoGrid
        photos={photos}
        {...(label !== undefined ? { label } : {})}
        {...(className !== undefined ? { className } : {})}
        onOpen={(next) => {
          setIndex(next);
          setOpen(true);
          onView?.(next);
        }}
      />
      <PhotoViewer
        photos={photos}
        open={open}
        index={index}
        {...(label !== undefined ? { label } : {})}
        onIndexChange={(next) => {
          setIndex(next);
          onView?.(next);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
