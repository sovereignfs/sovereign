'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Alert, Button, ConfirmDialog, EmptyState, FileDropzone, Progress } from '@sovereignfs/ui';
import { deleteFileAction, type DeleteFileResult } from './actions';
import styles from '../security/security.module.css';
import listStyles from './files.module.css';

export type FileRow = {
  id: string;
  name: string;
  size: number;
  type: string;
  inline: boolean;
  createdAt: string;
};

type Usage = { bytes: number; files: number; quota: { bytes: number; files: number } };

/** A size as a person reads it: 512 KB, 3.4 MB, 200 GB. */
export function sizeOf(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} bytes` : `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** What a person is told when an upload is refused, whatever the reason: the server's words when it gave some. */
async function refusal(reply: Response): Promise<string> {
  const body = (await reply.json().catch(() => ({}))) as { message?: string };
  return body.message ?? 'That file could not be kept. Try again.';
}

/** Their space, the files they keep, a way to add one, and a way to delete one. */
export function FilesPanel({
  files,
  usage,
  maxUploadBytes,
}: {
  files: FileRow[];
  usage: Usage;
  maxUploadBytes: number;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [sending, setSending] = useState<string | undefined>();
  const full = usage.quota.bytes === 0 ? 0 : (usage.bytes / usage.quota.bytes) * 100;

  async function send(file: File | null) {
    if (!file) return;
    setError('');
    if (file.size > maxUploadBytes) {
      setError(
        `That file is larger than ${sizeOf(maxUploadBytes)}, the most that can be sent at once.`,
      );
      return;
    }
    setSending(file.name);
    try {
      const reply = await fetch('/api/files', {
        method: 'POST',
        headers: { 'x-file-name': encodeURIComponent(file.name) },
        body: file,
      });
      if (!reply.ok) {
        setError(await refusal(reply));
        return;
      }
      router.refresh();
    } catch {
      setError('The file could not be sent. Check your connection and try again.');
    } finally {
      setSending(undefined);
    }
  }

  return (
    <>
      <div>
        <Progress value={full} label="How much of your space is used" />
        <p className={styles.footer}>
          {usage.files} of {usage.quota.files} files, {sizeOf(usage.bytes)} of{' '}
          {sizeOf(usage.quota.bytes)} used.
        </p>
      </div>
      <FileDropzone
        ariaLabel="A file to keep in your account"
        label={sending ? `Sending ${sending}…` : 'Choose a file'}
        hint={`or drag and drop here, up to ${sizeOf(maxUploadBytes)}`}
        disabled={sending !== undefined}
        onFileSelect={(file) => void send(file)}
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {files.length === 0 ? (
        <EmptyState
          icon="folder"
          heading="No files yet"
          description="Files you add are kept here, and nobody else can open them."
        />
      ) : (
        <ul className={listStyles.list}>
          {files.map((file) => (
            <FileItem key={file.id} file={file} />
          ))}
        </ul>
      )}
    </>
  );
}

function FileItem({ file }: { file: FileRow }) {
  const [open, setOpen] = useState(false);
  const [state, remove, pending] = useActionState<DeleteFileResult | null, null>(
    (previous) => deleteFileAction(file.id, previous),
    null,
  );

  return (
    <li className={listStyles.item}>
      <div className={listStyles.about}>
        <p className={listStyles.name}>
          <a
            className={listStyles.link}
            href={`/api/files/${file.id}`}
            {...(file.inline ? {} : { download: file.name })}
          >
            {file.name}
          </a>
        </p>
        <p className={styles.footer}>
          {sizeOf(file.size)}, added {when(file.createdAt)}.
        </p>
      </div>
      <div className={listStyles.actions}>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${file.name}?`}
        message="It is deleted at once and cannot be got back. Anything that points to it stops working."
        confirmLabel={pending ? 'Deleting…' : 'Delete'}
        destructive
        pending={pending}
        error={state && !state.ok ? state.error : undefined}
        onConfirm={() =>
          startTransition(() => {
            remove(null);
            setOpen(false);
          })
        }
      />
    </li>
  );
}
