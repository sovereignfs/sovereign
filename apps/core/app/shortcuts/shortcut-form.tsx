'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useState } from 'react';
import {
  Alert,
  AppTile,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  FileDropzone,
  FormField,
  Icon,
  IconPicker,
  Input,
  SegmentedControl,
} from '@sovereignfs/ui';
import type { Shortcut } from '../../src/shortcuts/manager';
import type { ShortcutFormResult } from '../../src/shortcuts/form';
import { SHORTCUT_SYMBOLS, type ShortcutSymbol } from '../../src/shortcuts/symbols';
import styles from './shortcuts.module.css';

type Action = (previous: ShortcutFormResult | null, form: FormData) => Promise<ShortcutFormResult>;
type RemoveAction = (previous: ShortcutFormResult | null) => Promise<ShortcutFormResult>;
type Mode = 'letter' | 'symbol' | 'image';

const MODES: { value: Mode; label: string }[] = [
  { value: 'letter', label: 'Letter' },
  { value: 'symbol', label: 'Icon' },
  { value: 'image', label: 'Picture' },
];

/**
 * Adds a shortcut, or changes one (core-app §3.8.1): a name, an address, a line about it, and an icon, which is a
 * letter drawn from the name, an icon from the set, or an uploaded picture. The preview is the tile as the launcher
 * draws it, in greys. Every field is held here, so a refusal leaves what was typed; it is sent from `onSubmit`, not as
 * a form action, which would reset the form.
 */
export function ShortcutForm({
  initial,
  action,
  removeAction,
  cancelHref,
  tag,
}: {
  initial?: Shortcut;
  action: Action;
  removeAction?: RemoveAction;
  cancelHref: string;
  /** What the preview's tag says: `shortcut`, or `yours` for a person's own. */
  tag: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [appUrl, setAppUrl] = useState(initial?.appUrl ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [mode, setMode] = useState<Mode>(
    initial?.icon?.kind === 'symbol'
      ? 'symbol'
      : initial?.icon?.kind === 'image'
        ? 'image'
        : 'letter',
  );
  const [symbol, setSymbol] = useState<ShortcutSymbol>(
    initial?.icon?.kind === 'symbol' ? initial.icon.symbol : 'link',
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | undefined>(
    initial?.icon?.kind === 'image' ? initial.icon.path : undefined,
  );
  const [confirming, setConfirming] = useState(false);

  // A picked file is shown from this browser's memory until the form is sent; nothing leaves before then.
  useEffect(() => {
    if (!file) return;
    const address = URL.createObjectURL(file);
    setPreview(address);
    return () => URL.revokeObjectURL(address);
  }, [file]);

  const [state, save, saving] = useActionState<ShortcutFormResult | null, FormData>(action, null);
  const [removeState, remove, removing] = useActionState<ShortcutFormResult | null, null>(
    async (previous) => (removeAction ? removeAction(previous) : previous),
    null,
  );
  const fields = state && !state.ok ? state.fields : {};
  const hasPicture = file !== null || initial?.icon?.kind === 'image';
  const iconField =
    mode === 'symbol'
      ? 'symbol'
      : mode === 'image'
        ? file
          ? 'image'
          : hasPicture
            ? 'keep'
            : 'image'
        : 'none';

  const icon =
    mode === 'symbol' ? (
      <Icon name={symbol} size="lg" aria-hidden={true} />
    ) : mode === 'image' && preview ? (
      // A same-origin address or this browser's own memory: never another site's.
      <img src={preview} alt="" className={styles.picture} />
    ) : (
      <Avatar name={name || '?'} size="md" />
    );

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => save(data));
      }}
    >
      <div className={styles.columns}>
        <div className={styles.fields}>
          <FormField label="Name" required error={fields.name}>
            {(field) => (
              <Input
                {...field}
                name="name"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Address"
            required
            hint="The page the tile opens, in a new tab."
            error={fields.url}
          >
            {(field) => (
              <Input
                {...field}
                name="url"
                inputMode="url"
                placeholder="https://drive.proton.me"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Open in app"
            hint="Optional: an app's own address, such as spotify:… It is tried first on a phone and in an installed Sovereign, and the address opens if nothing answers."
            error={fields.appUrl}
          >
            {(field) => (
              <Input
                {...field}
                name="appUrl"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="spotify:playlist:…"
                value={appUrl}
                onChange={(event) => setAppUrl(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Description"
            hint="A line about what it is, shown on the tile."
            error={fields.description}
          >
            {(field) => (
              <Input
                {...field}
                name="description"
                maxLength={280}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </FormField>

          <fieldset className={styles.icon}>
            <legend className={styles.legend}>Icon</legend>
            <SegmentedControl aria-label="Icon" options={MODES} value={mode} onChange={setMode} />
            <input type="hidden" name="icon" value={iconField} />
            {mode === 'symbol' ? (
              <>
                <input type="hidden" name="symbol" value={symbol} />
                <IconPicker
                  aria-label="Choose an icon"
                  options={SHORTCUT_SYMBOLS}
                  value={symbol}
                  onChange={(next) => setSymbol(next as ShortcutSymbol)}
                  triggerLabel="Choose an icon"
                />
              </>
            ) : null}
            {mode === 'image' ? (
              <FileDropzone
                name="image"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                ariaLabel="Upload a picture"
                label={
                  file ? file.name : hasPicture ? 'Upload another picture' : 'Upload a picture'
                }
                hint="PNG, JPEG, WebP or SVG, up to 256 KB. It is shown in greys, like every tile."
                onFileSelect={setFile}
              />
            ) : null}
            {mode === 'letter' ? (
              <p className={styles.hint}>The tile draws the first letter of the name.</p>
            ) : null}
            {fields.icon ? (
              <p className={styles.error} role="alert">
                {fields.icon}
              </p>
            ) : null}
          </fieldset>
        </div>

        <div className={styles.preview} aria-label="Preview">
          <AppTile
            name={name || 'Name'}
            {...(description ? { description } : {})}
            icon={icon}
            monochrome
            tags={
              <Badge variant="mono" size="sm" uppercase={false}>
                {tag}
              </Badge>
            }
          />
        </div>
      </div>

      {state && !state.ok ? <Alert variant="error">{state.error}</Alert> : null}
      <div className={styles.buttons}>
        <Button type="submit" loading={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add shortcut'}
        </Button>
        <ButtonLink
          href={cancelHref}
          variant="secondary"
          renderLink={(props) => <Link {...props} />}
        >
          Cancel
        </ButtonLink>
        {initial && removeAction ? (
          <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        ) : null}
      </div>
      {removeAction ? (
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          title="Remove this shortcut?"
          message={`“${initial?.name ?? ''}” leaves the launcher.`}
          confirmLabel={removing ? 'Removing…' : 'Remove'}
          destructive
          pending={removing}
          error={removeState && !removeState.ok ? removeState.error : undefined}
          onConfirm={() => startTransition(() => remove(null))}
        />
      ) : null}
    </form>
  );
}
