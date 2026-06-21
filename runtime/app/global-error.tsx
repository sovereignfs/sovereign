'use client';

import { useEffect } from 'react';

// global-error replaces the root layout; must include <html> and <body>.
// Inline styles are required here — CSS modules depend on the root layout's
// token import, which is unavailable when the root layout itself errors.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#fafafa',
          color: '#09090b',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '4rem', fontWeight: 700, margin: '0 0 0.5rem' }}>500</h1>
          <p style={{ margin: '0 0 1.5rem', color: '#71717a' }}>Something went wrong.</p>
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1.25rem',
              border: '1px solid #d4d4d8',
              borderRadius: '6px',
              background: '#09090b',
              color: '#fafafa',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
