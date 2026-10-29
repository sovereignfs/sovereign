'use client';

import { useState } from 'react';
import { Button } from '@sovereignfs/ui';

/** Copies text to the clipboard, and says so. The clipboard is touched only when it is asked for. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : label}
    </Button>
  );
}
