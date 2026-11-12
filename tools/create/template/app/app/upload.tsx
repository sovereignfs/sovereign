'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, Input } from './ui';

/**
 * Sends the chosen file to /api/files as it is, with its name beside it, and shows what the app answered when it would not keep it
 * (too large, no room left). The page is made again afterwards, so the new file is in the list.
 */
export function Upload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(file: File) {
    setBusy(true);
    setMessage('');
    try {
      const reply = await fetch('/api/files', {
        method: 'POST',
        headers: { 'x-file-name': encodeURIComponent(file.name) },
        body: file,
      });
      if (!reply.ok) {
        const body = (await reply.json().catch(() => ({}))) as { message?: string };
        setMessage(body.message ?? 'That file could not be kept. Try again.');
        return;
      }
      if (input.current) input.current.value = '';
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Input
        ref={input}
        type="file"
        aria-label="A file to keep"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void send(file);
        }}
      />
      {busy ? <Button disabled>Sending…</Button> : null}
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
