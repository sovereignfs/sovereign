import { requirePerson } from '@/lib/person';
import { files } from '@/lib/files';
import { keySettings } from '@/lib/keys';
import { deleteFile } from './actions';
import { Notes } from './notes';
import { Notifications } from './notifications';
import { SignOutForm } from './sign-out';
import { Button, Card, PageHeader } from './ui';
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
  // Sends a person to sign in with core, and back here.
  const session = await requirePerson('/');
  // Their files, kept the suite's way: a folder for this person and a quota for this person (lib/files.ts).
  const [kept, usage] = await Promise.all([files().list(session.sub), files().usage(session.sub)]);
  const name = session.name || 'there';

  return (
    <main>
      <PageHeader title="__TITLE__" description={`Signed in as ${name}`} />
      {/* The notes are opened and written in the browser alone (app/notes.tsx); the server renders nothing of them. */}
      <Notes {...keySettings()} appName="__TITLE__" />
      <Card>
        <div>
          <h2>Files</h2>
          <p>
            {usage.files} of {usage.quota.files} files, {size(usage.bytes)} of{' '}
            {size(usage.quota.bytes)} used. Files are not encrypted: the server can read them.
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
      {/* Signing out ends the session, and with it the secret this browser's kept key needs: it opens nothing afterwards. */}
      <SignOutForm>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </SignOutForm>
    </main>
  );
}
