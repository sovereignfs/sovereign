import { sdk } from '@sovereignfs/sdk';
import { Card, EmptyState } from '@sovereignfs/ui';
import { findNotesByLabel, listNotes, type NoteView } from './_lib/data';
import { NoteForm } from './NoteForm';
import styles from './example-encrypted.module.css';

/**
 * Reference plugin for app-level field encryption (RFC 0092). What it
 * demonstrates, end to end: classified schema columns (`_db/schema.ts`),
 * `seal()` before writes / `open()` after reads (`_lib/data.ts`), blind-index
 * exact-match search that stays correct through key rotations, table
 * registration for the operator tools, and a plaintext export resolver.
 *
 * Everything here also works on an instance with NO encryption configured —
 * values pass through as encoded `svf0` envelopes instead of ciphertext, and
 * the code never branches on which.
 */
export default async function ExampleEncryptedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await sdk.auth.getSession();
  if (!session) return null; // middleware redirects; render nothing in the gap

  const { q } = await searchParams;
  const query = q?.trim() ?? '';
  const notes: NoteView[] = query
    ? await findNotesByLabel(session.user.id, query)
    : await listNotes(session.user.id);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Encrypted notes</h1>
        <p className={styles.subtitle}>
          Notes are encrypted before they reach the database. Search works by exact label match —
          the only lookup encrypted data supports.
        </p>
      </header>

      <Card>
        <NoteForm />
      </Card>

      <form method="get" className={styles.search}>
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Find by exact label"
          className={styles.searchInput}
        />
      </form>

      {notes.length === 0 ? (
        <EmptyState
          heading={query ? 'No note has that exact label' : 'No notes yet'}
          description={
            query
              ? 'Labels match exactly — check the spelling, or clear the search.'
              : 'Add a note above. It is encrypted before it is stored.'
          }
        />
      ) : (
        <ul className={styles.noteList}>
          {notes.map((note) => (
            <li key={note.id} className={styles.note}>
              <span className={styles.noteLabel}>{note.label}</span>
              <span className={styles.noteBody}>{note.body}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
