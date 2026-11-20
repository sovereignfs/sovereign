import { requireSignedIn, userOfSession } from '@/lib/session';
import { db } from '@/lib/db';
import { files } from '@/lib/files';
import { addNote, deleteFile, deleteNote } from './actions';
import { Notifications } from './notifications';
import { SignOutForm } from './sign-out';
import { Button, ButtonLink, Card, Input, PageHeader } from './ui';
import { Upload } from './upload';

/** A size as a person reads it: 512 KB, 3.4 MB, 200 GB. */
function size(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} bytes` : `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

// The page is for the person signed in, so it is made for each request.
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Sends a person to sign in, and back here.
  const session = await requireSignedIn('/');
  const { rows } = await db().query<{ id: string; body: string }>(
    'SELECT id, body FROM notes WHERE owner = $1 ORDER BY id DESC LIMIT 100',
    [session.user.id],
  );
  // Their files, kept the suite's way: a folder for this person and a quota for this person (lib/files.ts).
  const [kept, usage] = await Promise.all([
    files().list(session.user.id),
    files().usage(session.user.id),
  ]);
  const user = await userOfSession(session);
  const name = user.name ?? user.email;

  return (
    <main>
      <PageHeader title="__TITLE__" description={`Signed in as ${name}`} />
      <Card>
        <form action={addNote}>
          <Input name="body" placeholder="A note" aria-label="A note" maxLength={2000} required />
          <Button type="submit">Add</Button>
        </form>
      </Card>
      <ul>
        {rows.map((note) => (
          <li key={note.id}>
            <Card>
              <form action={deleteNote}>
                <span style={{ flex: 1 }}>{note.body}</span>
                <input type="hidden" name="id" value={note.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Delete
                </Button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <div>
          <h2>Files</h2>
          <p>
            {usage.files} of {usage.quota.files} files, {size(usage.bytes)} of{' '}
            {size(usage.quota.bytes)} used
          </p>
          <Upload />
        </div>
      </Card>
      <ul>
        {kept.map((file) => (
          <li key={file.id}>
            <Card>
              <form action={deleteFile}>
                <a href={`/api/files/${file.id}`} style={{ flex: 1 }}>
                  {file.name} ({size(file.size)})
                </a>
                <input type="hidden" name="id" value={file.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Delete
                </Button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <Notifications />
      </Card>
      <SignOutForm>
        <ButtonLink href="/security" variant="secondary">
          Security
        </ButtonLink>{' '}
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </SignOutForm>
    </main>
  );
}
