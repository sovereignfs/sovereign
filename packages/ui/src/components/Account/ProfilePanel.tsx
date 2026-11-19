import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert } from '../Alert/Alert';
import { Button } from '../Button/Button';
import { FormField } from '../FormField/FormField';
import { Input } from '../Input/Input';
import styles from './Account.module.css';

export interface ProfilePanelProps {
  name: string;
  email: string;
  /** The address of the person's picture, or null when they have none. */
  image: string | null;
  /** Saves the name; a sentence when it was refused. */
  saveName: (name: string) => Promise<{ error?: string }>;
  /** Makes a chosen file the picture to keep (cropped and scaled by the app); throws when it cannot. */
  preparePicture: (file: Blob) => Promise<Blob>;
  /** What to say when a file could not be prepared. */
  describePictureError?: (error: unknown) => string;
  /** Keeps a prepared picture, or removes the picture with `null`: the new address, or a sentence. */
  savePicture: (picture: Blob | null) => Promise<{ image: string | null } | { error: string }>;
}

const notAPicture = () => 'That picture could not be read. Use a PNG, JPEG or WebP picture.';

/** The person's name, their picture, and their email address, which is shown and cannot be changed (auth.md §7). */
export function ProfilePanel({
  name,
  email,
  image,
  saveName,
  preparePicture,
  describePictureError = notAPicture,
  savePicture,
}: ProfilePanelProps) {
  return (
    <div className={styles.form}>
      <PictureSection
        name={name}
        image={image}
        prepare={preparePicture}
        describe={describePictureError}
        save={savePicture}
      />
      <NameSection initial={name} save={saveName} />
      <div className={styles.form}>
        <p className={styles.heading}>Email address</p>
        <p className={styles.text}>{email}</p>
        <p className={styles.footer}>Your email address cannot be changed here.</p>
      </div>
    </div>
  );
}

function NameSection({ initial, save }: { initial: string; save: ProfilePanelProps['saveName'] }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setSaved(false);
    const result = await save(name);
    setPending(false);
    if (result.error) {
      setError(result.error);
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

function PictureSection({
  name,
  image,
  prepare,
  describe,
  save,
}: {
  name: string;
  image: string | null;
  prepare: ProfilePanelProps['preparePicture'];
  describe: NonNullable<ProfilePanelProps['describePictureError']>;
  save: ProfilePanelProps['savePicture'];
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
      setError(describe(problem));
    }
    setPending(false);
  }

  async function keep(picture: Blob | null) {
    setPending(true);
    setError(undefined);
    const result = await save(picture);
    setPending(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setCurrent(result.image);
    forget();
  }

  const shown = chosen?.preview ?? current;
  return (
    <div className={styles.form}>
      <p className={styles.heading}>Picture</p>
      <div className={styles.avatarRow}>
        {shown ? (
          // The picture is the app's own, or a preview made in this browser: nothing the person typed.
          <img className={styles.avatar} src={shown} alt={name} width={96} height={96} />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {(name.trim()[0] ?? '?').toUpperCase()}
          </span>
        )}
        <div className={styles.form}>
          {chosen ? (
            <div className={styles.row}>
              <Button loading={pending} onClick={() => void keep(chosen.blob)}>
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
                <Button variant="ghost" onClick={() => void keep(null)}>
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
