import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { addNote, deleteNote } from './actions';
import { Button, Card, Input, PageHeader } from './ui';

// The page is for the person signed in, so it is made for each request.
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Sends a person to sign in with core, and back here.
  const session = await auth().requireSession('/');
  const { rows } = await db().query<{ id: string; body: string }>(
    'SELECT id, body FROM notes WHERE owner = $1 ORDER BY id DESC LIMIT 100',
    [session.sub],
  );
  const name = typeof session.claims.name === 'string' ? session.claims.name : 'there';

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
      <form action="/auth/logout" method="post">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </main>
  );
}
