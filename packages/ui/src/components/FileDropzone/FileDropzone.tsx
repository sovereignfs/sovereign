'use client';

import type { DragEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './FileDropzone.module.css';

export interface FileDropzoneProps {
  /** Native `<input type="file">` `name` attribute — set this to submit the
   * file as part of a native `<form action={...}>` (Server Action) request. */
  name?: string;
  /** Native `<input type="file">` `accept` attribute, e.g. `".zip,application/zip"`. */
  accept?: string;
  /** Icon shown beside the label — a file-type glyph. Defaults to a generic file icon. */
  icon?: ReactNode;
  /** Primary label — e.g. "Choose a ZIP file", or the selected file's name. */
  label: string;
  /** Secondary hint — e.g. "or drag and drop here", or the selected file's size. */
  hint?: string;
  /** Called with the picked or dropped file, or `null` if the input is cleared. */
  onFileSelect: (file: File | null) => void;
  /** Accessible name for the control — describe what will be uploaded. */
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A styled drag-and-drop file picker: a dashed-border dropzone wrapping a
 * visually-hidden native `<input type="file">`, so the native picker still
 * opens on click and the field participates in normal form semantics. A
 * dropped file is written into the input's own `FileList` (via `DataTransfer`)
 * so `name` + native `<form action>` submission sees it exactly like a
 * click-picked file — not just the `onFileSelect` callback.
 *
 * Caller owns the selected-file state and passes `label`/`hint` accordingly
 * (e.g. swap to the picked file's name/size) — this component is otherwise
 * uncontrolled and stateless beyond its own drag-hover visual.
 *
 * Do not pass `required` through to a wrapping form's validation via this
 * field — `display: none` on the hidden input does not exempt it from HTML5
 * constraint validation, so a `required` hidden input can block submission
 * with no visible field for the user to focus. Validate `onFileSelect`'s
 * result in application code instead.
 */
export function FileDropzone({
  name,
  accept,
  icon,
  label,
  hint,
  onFileSelect,
  ariaLabel,
  disabled,
  className,
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className={[
        styles.dropzone,
        dragging ? styles.dropzoneActive : '',
        disabled ? styles.dropzoneDisabled : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(event: DragEvent) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event: DragEvent) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(false);
        const dropped = event.dataTransfer.files[0];
        if (!dropped) return;
        if (inputRef.current && typeof DataTransfer !== 'undefined') {
          const transfer = new DataTransfer();
          transfer.items.add(dropped);
          inputRef.current.files = transfer.files;
        }
        onFileSelect(dropped);
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon ?? <Icon name="file" size="lg" aria-hidden />}
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      <input
        ref={inputRef}
        type="file"
        name={name}
        aria-label={ariaLabel}
        accept={accept}
        disabled={disabled}
        onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
        className={styles.hiddenInput}
      />
    </label>
  );
}
