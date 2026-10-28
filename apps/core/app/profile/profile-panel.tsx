'use client';

import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { Alert, Button, FormField, Input } from '@sovereignfs/ui';
import { authClient } from '../../src/auth/client';
import styles from '../security/security.module.css';
import { AvatarPrepareError, browserDeps, prepareAvatar, type PrepareDeps } from './avatar-image';

type Props = {
  name: string;
  email: string;
  /** The address of the person's picture, or null when they have none. */
  image: string | null;
  /** How a picture is prepared; the browser's own unless a test passes another. */
  prepare?: (file: Blob) => Promise<Blob>;
};

const defaultPrepare = (file: Blob) => prepareAvatar(file, browserDeps satisfies PrepareDeps);

/** The person's name, their picture, and their email address, which is shown and cannot be changed. */
export function ProfilePanel({ name, email, image, prepare = defaultPrepare }: Props) {
  return (
    <div className={styles.form}>
      <AvatarSection name={name} image={image} prepare={prepare} />
      <NameSection initial={name} />
      <div className={styles.form}>
        <p className={styles.heading}>Email address</p>
        <p className={styles.text}>{email}</p>
        <p className={styles.footer}>Your email address cannot be changed here.</p>
      </div>
    </div>
  );
}

function NameSection({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setSaved(false);
    const result = await authClient.updateUser({ name });
    setPending(false);
    if (result.error) {
      setError(
        result.error.code === 'INVALID_NAME' && result.error.message
          ? result.error.message
          : result.error.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : 'Your name could not be saved. Try again.',
      );
      return;
    }
    setName(name.trim());
    setSaved(true);
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {saved ? <Alert variant="success">Your name is saved.</Alert> : null}
      <FormField label="Name" required>
        {(field) => (
          <Input
            {...field}
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
          />
        )}
      </FormField>
      <div className={styles.row}>
        <Button type="submit" loading={pending}>
          {pending ? 'Saving…' : 'Save name'}
        </Button>
      </div>
    </form>
  );
}

function AvatarSection({
  name,
  image,
  prepare,
}: {
  name: string;
  image: string | null;
  prepare: (file: Blob) => Promise<Blob>;
}) {
  const [current, setCurrent] = useState(image);
  /** A picture that has been cropped and scaled, shown before it is kept. */
  const [chosen, setChosen] = useState<{ blob: Blob; preview: string } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  function forget() {
    if (chosen) URL.revokeObjectURL(chosen.preview);
    setChosen(undefined);
    if (picker.current) picker.current.value = '';
  }

  async function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    setPending(true);
    try {
      const blob = await prepare(file);
      if (chosen) URL.revokeObjectURL(chosen.preview);
      setChosen({ blob, preview: URL.createObjectURL(blob) });
    } catch (problem) {
      setError(
        problem instanceof AvatarPrepareError
          ? problem.message
          : 'That picture could not be read. Use a PNG, JPEG or WebP picture.',
      );
    }
    setPending(false);
  }

  async function send(method: 'POST' | 'DELETE', body?: Blob) {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/profile/avatar', { method, ...(body ? { body } : {}) });
      const answer = (await response.json().catch(() => ({}))) as {
        image?: string | null;
        message?: string;
      };
      if (!response.ok) {
        setError(answer.message ?? 'The picture could not be saved. Try again.');
        return;
      }
      setCurrent(answer.image ?? null);
      forget();
    } catch {
      setError('The picture could not be saved. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  const shown = chosen?.preview ?? current;
  return (
    <div className={styles.form}>
      <p className={styles.heading}>Picture</p>
      <div className={styles.avatarRow}>
        {shown ? (
          // The picture is core's own, or a preview made in this browser: nothing the person typed.
          <img className={styles.avatar} src={shown} alt={name} width={96} height={96} />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {(name.trim()[0] ?? '?').toUpperCase()}
          </span>
        )}
        <div className={styles.form}>
          {chosen ? (
            <div className={styles.row}>
              <Button loading={pending} onClick={() => void send('POST', chosen.blob)}>
                {pending ? 'Saving…' : 'Use this picture'}
              </Button>
              <Button variant="ghost" onClick={forget}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className={styles.row}>
              <Button variant="secondary" loading={pending} onClick={() => picker.current?.click()}>
                {current ? 'Change picture' : 'Choose a picture'}
              </Button>
              {current ? (
                <Button variant="ghost" onClick={() => void send('DELETE')}>
                  Remove picture
                </Button>
              ) : null}
            </div>
          )}
          <input
            ref={picker}
            className={styles.visuallyHidden}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Choose a picture"
            tabIndex={-1}
            onChange={(event) => void onChoose(event)}
          />
          <p className={styles.footer}>
            PNG, JPEG or WebP. It is cropped to a square around the middle.
          </p>
        </div>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
