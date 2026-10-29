'use client';

import { useState } from 'react';
import { Button } from '../Button/Button';

export interface CopyButtonProps {
  /** What is put on the clipboard. Nothing is read or written until the button is pressed. */
  text: string;
  /** The button's label before it is pressed, for example "Copy link". */
  label: string;
  /** What the button says once the text is on the clipboard. */
  copiedLabel?: string;
  /** What it says when the browser would not let the text be copied (no permission, or an insecure page). */
  failedLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * CopyButton — copies a piece of text to the clipboard and says so. The clipboard is touched only when the button is
 * pressed, and the button says plainly when the browser refused, rather than pretending the text was copied.
 */
export function CopyButton({
  text,
  label,
  copiedLabel = 'Copied',
  failedLabel = 'Could not copy',
  variant = 'secondary',
  size = 'sm',
}: CopyButtonProps) {
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
    <Button type="button" variant={variant} size={size} onClick={() => void copy()}>
      {state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : label}
    </Button>
  );
}
