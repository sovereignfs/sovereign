'use client';

import { useRef, useState } from 'react';
import { Alert, Button } from '@sovereignfs/ui';
import styles from './settings.module.css';

type Kind = 'logo-light' | 'logo-dark' | 'favicon';

const PICTURES: { kind: Kind; label: string; hint: string; dark?: boolean }[] = [
  {
    kind: 'logo-light',
    label: 'Logo for light pages',
    hint: 'Shown on the sign-in page and in emails. PNG, JPEG, WebP or SVG, up to 1 MB.',
  },
  {
    kind: 'logo-dark',
    label: 'Logo for dark pages',
    hint: 'Used instead of the light logo when the page is dark.',
    dark: true,
  },
  {
    kind: 'favicon',
    label: 'Favicon',
    hint: 'The small icon in the browser tab. A square picture works best.',
  },
];

type Shown = Record<Kind, string | undefined>;

/**
 * The instance's logos and favicon. A picture goes straight to `/api/console/branding/<kind>` as the request's
 * body; the server judges it by its bytes, so the name and type the browser reports are not relied on.
 */
export function Pictures({ images, canEdit }: { images: Shown; canEdit: boolean }) {
  const [current, setCurrent] = useState<Shown>(images);
  const [busy, setBusy] = useState<Kind | undefined>();
  const [problem, setProblem] = useState<{ kind: Kind; message: string } | undefined>();
  const inputs = useRef<Partial<Record<Kind, HTMLInputElement | null>>>({});

  async function send(kind: Kind, method: 'POST' | 'DELETE', body?: File) {
    setBusy(kind);
    setProblem(undefined);
    try {
      const response = await fetch(`/api/console/branding/${kind}`, {
        method,
        ...(body ? { body } : {}),
      });
      const result = (await response.json().catch(() => ({}))) as {
        image?: string | null;
        message?: string;
      };
      if (!response.ok) {
        setProblem({
          kind,
          message: result.message ?? 'That could not be saved. Try again.',
        });
        return;
      }
      setCurrent((before) => ({ ...before, [kind]: result.image ?? undefined }));
    } catch {
      setProblem({
        kind,
        message: 'That could not be saved. Check your connection and try again.',
      });
    } finally {
      setBusy(undefined);
      const input = inputs.current[kind];
      if (input) input.value = '';
    }
  }

  return (
    <div className={styles.pictures}>
      {PICTURES.map(({ kind, label, hint, dark }) => {
        const image = current[kind];
        const id = `picture-${kind}`;
        return (
          <div key={kind} className={styles.picture}>
            <div className={dark ? styles.previewDark : styles.preview}>
              {image ? (
                <img src={image} alt={`${label}, as set`} className={styles.previewImage} />
              ) : (
                <span className={styles.previewEmpty}>None set</span>
              )}
            </div>
            <div className={styles.pictureBody}>
              <label className={styles.pictureLabel} htmlFor={id}>
                {label}
              </label>
              <p className={styles.hint}>{hint}</p>
              {canEdit ? (
                <div className={styles.buttons}>
                  <input
                    ref={(element) => {
                      inputs.current[kind] = element;
                    }}
                    id={id}
                    className={styles.fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void send(kind, 'POST', file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={busy === kind}
                    disabled={busy !== undefined}
                    onClick={() => inputs.current[kind]?.click()}
                  >
                    {busy === kind ? 'Saving…' : image ? 'Replace' : 'Upload'}
                  </Button>
                  {image ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy !== undefined}
                      onClick={() => void send(kind, 'DELETE')}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {problem?.kind === kind ? <Alert variant="error">{problem.message}</Alert> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
