'use client';

import { useEffect } from 'react';

/**
 * Error boundary for the @modal parallel-route slot (RFC 0001). Without this,
 * an unhandled RSC error in any overlay page propagates out of the slot with no
 * boundary, and Next.js 15 surfaces it as a full-page 404 instead of routing it
 * to the root error.tsx. This boundary confines the error to the overlay and
 * renders a recoverable inline state (the Dialog chrome comes from the slot
 * layout above, so this renders inside the open dialog).
 */
export default function ModalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[overlay] render error', error.digest ?? error.message);
  }, [error]);

  return (
    <div
      style={{
        padding: '2rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        minHeight: '8rem',
        justifyContent: 'center',
      }}
    >
      <p style={{ color: 'var(--sv-color-text-secondary, #71717a)', margin: 0 }}>
        This page could not be loaded.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '0.5rem 1.25rem',
          border: '1px solid var(--sv-color-border, #d4d4d8)',
          borderRadius: 'var(--sv-radius-sm, 6px)',
          background: 'var(--sv-color-accent, #09090b)',
          color: 'var(--sv-color-on-accent, #fafafa)',
          cursor: 'pointer',
          fontSize: '0.875rem',
        }}
      >
        Try again
      </button>
    </div>
  );
}
