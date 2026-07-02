'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@sovereignfs/ui';
import styles from '../account.module.css';

function monogram(label: string): string {
  const [first = '', second = ''] = label.trim().split(/\s+/);
  const initials = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
  return initials.toUpperCase();
}

/** Avatar preview + file picker that uploads to the runtime (ACC-03). */
export function AvatarUpload({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.set('avatar', file);
      const res = await fetch('/api/account/avatar', { method: 'POST', body });
      if (!res.ok) {
        const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
        setError(detail ?? `Upload failed (${String(res.status)}).`);
        return;
      }
      router.refresh();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.avatarRow}>
      <span className={styles.avatarPreview} aria-hidden="true">
        {imageUrl ? <img src={imageUrl} alt="" className={styles.avatarImage} /> : monogram(name)}
      </span>
      <div className={styles.avatarControls}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : imageUrl ? 'Replace avatar' : 'Upload avatar'}
        </Button>
        <p className={styles.help}>JPEG, PNG, or WebP. Max 2 MB.</p>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
