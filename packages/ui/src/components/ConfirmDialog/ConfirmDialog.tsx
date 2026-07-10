'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { Button } from '../Button/Button';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  /** Whether the dialog is shown. */
  open: boolean;
  /** Called on Esc, backdrop click, or the Cancel button. */
  onClose: () => void;
  title: string;
  /** Accepts rich content (e.g. `Remove <strong>{name}</strong>?`), not just
   *  plain text. */
  message: ReactNode;
  /** Called when the confirm action is clicked. Does not close the dialog
   *  itself — pass `pending`/close it via `onClose` from the caller once the
   *  action settles, so an async action that fails can keep the dialog open
   *  to show `error`. */
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as a destructive (red) action. */
  destructive?: boolean;
  /** Disables both actions — pair with a `confirmLabel` reflecting the
   *  in-flight state (e.g. "Removing…") for an `onConfirm` that triggers an
   *  async action. */
  pending?: boolean;
  /** Optional inline error, shown between the message and the actions — e.g.
   *  a failed async `onConfirm` that keeps the dialog open to report it. */
  error?: ReactNode;
}

/**
 * ConfirmDialog — a small, content-sized confirm/cancel prompt. Deliberately
 * NOT built on `Dialog`, which is a fixed-size box by design (so switching
 * views inside it never resizes the panel) — a confirm prompt is the opposite
 * case, sized to its message. Built on the native `<dialog>` element instead,
 * same as the pattern this component replaces (duplicated across the account
 * and console plugins): top-layer rendering and `::backdrop` come from the
 * browser for free, which is what makes a confirm opened *from inside*
 * another overlay (Dialog, Sheet) reliably stack above it without a manual
 * z-index scheme.
 *
 * Same presentation on desktop and mobile — a small centered card, not a
 * full-screen sheet (unlike Dialog/Sheet, which do fork by viewport).
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  error,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  // The native <dialog> fires its own 'close' event on Esc (built-in, no
  // listener needed for that) and whenever .close() runs — including the
  // effect above reacting to `open` going false. Listening for it here is
  // what makes Esc call the caller's onClose without a manual keydown handler.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.body}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.message}>{message}</div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          {destructive ? (
            // A solid red fill, not Button's own `destructive` variant (an
            // outlined/ghost style meant for lower-emphasis placements) — a
            // confirm action should read as strongly as `Button`'s primary
            // variant does. Uses the same --sv-color-error-solid /
            // -text-on-error tokens the codebase already introduced for this
            // exact "reads as a filled action button, not a tinted status
            // surface" case (see semantic.css).
            <button
              type="button"
              className={styles.destructiveConfirm}
              onClick={onConfirm}
              disabled={pending}
            >
              {confirmLabel}
            </button>
          ) : (
            <Button type="button" variant="primary" onClick={onConfirm} disabled={pending}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
