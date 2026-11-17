'use client';

import {
  appKeys,
  decryptBytes,
  encryptBytes,
  importDocumentKey,
  type CheckedPerson,
  type MyKeys,
  type OpenedIdentity,
  type PersonKeys,
} from '@sovereignfs/sdk/keys';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, Input, LockedState } from './ui';

/**
 * The notes, encrypted in this browser (ENCRYPTION.md, RFC 0005). The app key comes from core once each browser session; each note has
 * a key of its own, sealed to everyone who may read it; its title and text are encrypted with it. The server stores what this page sends
 * and can open none of it. Everything that opens or makes a key happens here.
 */

type Stored = {
  id: string;
  owner: string;
  version: number;
  meta: string;
  body: string;
  record: string;
  readers: string[];
};
type Note = Stored & { title: string; text: string };
type Keys = ReturnType<typeof appKeys>;
type Ready = { keys: Keys; identity: OpenedIdentity; me: MyKeys };

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};
const unb64 = (text: string) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
const metaId = (id: string) => `${id}/meta`;

async function json<T>(response: Response): Promise<T> {
  if (!response.ok)
    throw Object.assign(new Error(String(response.status)), { status: response.status });
  return (await response.json()) as T;
}

export function Notes(props: {
  core: string;
  clientId: string;
  returnTo: string;
  appName: string;
}) {
  const keys = useMemo(
    () => appKeys({ core: props.core, clientId: props.clientId, returnTo: props.returnTo }),
    [props.core, props.clientId, props.returnTo],
  );
  const [phase, setPhase] = useState<'opening' | 'locked' | 'open' | 'failed'>('opening');
  const [ready, setReady] = useState<Ready>();
  const [list, setList] = useState<Note[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The note being shared, by id: after each change the list is loaded again, and the dialog shows the note as it now is.
  const [sharingId, setSharingId] = useState<string>();

  /** A person's keys, checked against their account's signature and the signing key this browser remembers for them. */
  async function personKeys(
    sub: string,
    at: Ready,
  ): Promise<CheckedPerson | 'changed' | 'not-opened'> {
    if (sub === at.me.sub) return { ...at.me, checked: true };
    const response = await fetch(`/api/people/${encodeURIComponent(sub)}/keys`, {
      cache: 'no-store',
    });
    if (response.status === 404) return 'not-opened';
    const checked = await at.keys.checkPerson(await json<PersonKeys>(response));
    if (checked.ok) return checked.person;
    if (checked.reason === 'changed') return 'changed';
    throw new Error('Their keys are not signed by their account.');
  }

  /** Opens a note: its key from the record sealed to this person, checked as signed by the owner, then its title and text. */
  async function open(note: Stored, at: Ready): Promise<Note> {
    const owner = await personKeys(note.owner, at);
    if (typeof owner === 'string') throw new Error('The owner’s keys cannot be checked.');
    const raw = await at.keys.openShared({
      record: JSON.parse(note.record),
      documentId: note.id,
      me: at.me,
      from: owner,
      identity: at.identity,
    });
    try {
      const key = await importDocumentKey(raw);
      const meta = await decryptBytes(
        key,
        { documentId: metaId(note.id), version: note.version },
        unb64(note.meta),
      );
      const body = await decryptBytes(
        key,
        { documentId: note.id, version: note.version },
        unb64(note.body),
      );
      return {
        ...note,
        title: (JSON.parse(dec.decode(meta)) as { title: string }).title,
        text: dec.decode(body),
      };
    } finally {
      raw.fill(0);
    }
  }

  async function load(at: Ready) {
    const answer = await json<{ notes: Stored[]; names: Record<string, string> }>(
      await fetch('/api/notes', { cache: 'no-store' }),
    );
    setNames(answer.names);
    const opened: Note[] = [];
    for (const note of answer.notes) {
      try {
        opened.push(await open(note, at));
      } catch {
        // A note that does not open (its owner's keys changed, or it was tampered with) is left out, never shown as ciphertext.
      }
    }
    setList(opened);
  }

  useEffect(() => {
    let live = true;
    (async () => {
      const key = await keys.open();
      if (key.state === 'locked') return live && setPhase('locked');
      const me = await json<MyKeys>(await fetch('/api/me/keys', { cache: 'no-store' }));
      const identity = await keys.identity(key.key, me);
      if (!identity.ok) throw new Error(identity.reason);
      const at = { keys, identity: identity.identity, me };
      await load(at);
      if (live) {
        setReady(at);
        setPhase('open');
      }
    })().catch(() => live && setPhase('failed'));
    return () => {
      live = false;
    };
    // `load` reads only what it is given, so the keys are all this depends on.
  }, [keys]);

  /**
   * Encrypts a note with `documentKey` under `version` and sends it with its readers, the key sealed to each. The caller overwrites the
   * key's bytes.
   */
  async function write(
    at: Ready,
    id: string,
    version: number,
    title: string,
    text: string,
    documentKey: Uint8Array,
    readers: CheckedPerson[],
  ) {
    const key = await importDocumentKey(documentKey);
    const meta = await encryptBytes(
      key,
      { documentId: metaId(id), version },
      enc.encode(JSON.stringify({ title })),
    );
    const body = await encryptBytes(key, { documentId: id, version }, enc.encode(text));
    const sealed = await Promise.all(
      readers.map(async (to) => ({
        sub: to.sub,
        record: JSON.stringify(
          await at.keys.share({ documentKey, documentId: id, to, identity: at.identity }),
        ),
      })),
    );
    const response = await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, meta: b64(meta), body: b64(body), readers: sealed }),
    });
    if (!response.ok) throw new Error('The note was not saved.');
  }

  async function act(run: () => Promise<void>, failure: string) {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await run();
      await load(ready);
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    act(async () => {
      if (!ready || draft.trim() === '') return;
      const text = draft.trim();
      const documentKey = ready.keys.newDocumentKey();
      try {
        await write(
          ready,
          crypto.randomUUID(),
          1,
          text.split('\n')[0]?.slice(0, 120) ?? '',
          text,
          documentKey,
          [{ ...ready.me, checked: true }],
        );
      } finally {
        documentKey.fill(0);
      }
      setDraft('');
    }, 'Couldn’t save the note. Try again.');

  const remove = (note: Note) =>
    act(async () => {
      const response = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error('not deleted');
    }, 'Couldn’t delete the note. Try again.');

  /** Shares with one more person: the note's key, unchanged, sealed to them too. */
  async function shareWith(note: Note, person: CheckedPerson) {
    if (!ready) return;
    const raw = await ready.keys.openShared({
      record: JSON.parse(note.record),
      documentId: note.id,
      me: ready.me,
      from: { ...ready.me, checked: true },
      identity: ready.identity,
    });
    try {
      const readers = await checkedReaders(note.readers.filter((sub) => sub !== person.sub));
      await write(ready, note.id, note.version, note.title, note.text, raw, [...readers, person]);
    } finally {
      raw.fill(0);
    }
    await load(ready);
  }

  /** Stops sharing with someone: a new key for the note, sealed only to those who remain (RFC 0005 §8). */
  async function unshare(note: Note, sub: string) {
    if (!ready) return;
    const documentKey = ready.keys.newDocumentKey();
    try {
      const readers = await checkedReaders(note.readers.filter((each) => each !== sub));
      await write(ready, note.id, note.version + 1, note.title, note.text, documentKey, readers);
    } finally {
      documentKey.fill(0);
    }
    await load(ready);
  }

  async function checkedReaders(subs: string[]): Promise<CheckedPerson[]> {
    if (!ready) return [];
    const out: CheckedPerson[] = [];
    for (const sub of subs) {
      const keys_ = await personKeys(sub, ready);
      // Someone whose keys changed, or who cannot be checked, is not sealed to again until the owner shares with them anew.
      if (typeof keys_ !== 'string') out.push(keys_);
    }
    if (!out.some((reader) => reader.sub === ready.me.sub))
      out.push({ ...ready.me, checked: true });
    return out;
  }

  if (phase === 'opening') return null;
  if (phase === 'locked')
    return (
      <Card>
        <LockedState
          reason="locked"
          appName={props.appName}
          action={<Button onClick={() => void keys.unlock()}>Unlock</Button>}
        />
      </Card>
    );
  if (phase === 'failed')
    return (
      <Alert variant="error" heading="Couldn’t open your notes">
        Reload the page to try again. If it keeps happening, sign out and back in.
      </Alert>
    );

  const sharing = list.find((note) => note.id === sharingId);

  const who = (note: Note) => {
    if (note.owner !== ready?.me.sub) return `Shared with you by ${names[note.owner] ?? 'someone'}`;
    const others = note.readers.filter((sub) => sub !== note.owner);
    return others.length === 0
      ? 'Only you'
      : `Shared with ${others.map((sub) => names[sub] ?? 'someone').join(', ')}`;
  };

  return (
    <>
      <Card>
        <p>Only you and the people you share a note with can read it. Not yet audited.</p>
      </Card>
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What do you want to remember?"
            aria-label="A note"
            maxLength={20000}
            required
          />
          <Button type="submit" loading={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </Card>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {list.length === 0 ? (
        <EmptyState
          icon="file-text"
          heading="No notes yet"
          description="Write one above. Only you can read it until you share it."
        />
      ) : (
        <ul>
          {list.map((note) => (
            <li key={note.id}>
              <Card>
                <div style={{ flex: 1 }}>
                  <strong>{note.title}</strong>
                  <p>{note.text}</p>
                  <small>{who(note)}</small>
                </div>
                {note.owner === ready?.me.sub ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setSharingId(note.id)}>
                      Share
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(note)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  </>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {sharing && ready ? (
        <Share
          note={sharing}
          names={names}
          appName={props.appName}
          onClose={() => setSharingId(undefined)}
          find={(sub) => personKeys(sub, ready)}
          trust={async (keys_) => {
            await ready.keys.trustChanged(keys_);
          }}
          fetchKeys={async (sub) =>
            json<PersonKeys>(
              await fetch(`/api/people/${encodeURIComponent(sub)}/keys`, { cache: 'no-store' }),
            )
          }
          share={(person) => shareWith(sharing, person)}
          unshare={(sub) => unshare(sharing, sub)}
        />
      ) : null}
    </>
  );
}

function Share(props: {
  note: Note;
  names: Record<string, string>;
  appName: string;
  onClose: () => void;
  find: (sub: string) => Promise<CheckedPerson | 'changed' | 'not-opened'>;
  trust: (keys: PersonKeys) => Promise<void>;
  fetchKeys: (sub: string) => Promise<PersonKeys>;
  share: (person: CheckedPerson) => Promise<void>;
  unshare: (sub: string) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ sub: string; name: string }[]>([]);
  const [message, setMessage] = useState('');
  const [changed, setChanged] = useState<{ sub: string; name: string }>();
  const [busy, setBusy] = useState(false);
  const others = props.note.readers.filter((sub) => sub !== props.note.owner);

  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const timer = setTimeout(() => {
      void fetch(`/api/people?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : { people: [] }))
        .then((answer: { people: { sub: string; name: string }[] }) => setFound(answer.people));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  async function choose(person: { sub: string; name: string }) {
    setBusy(true);
    setMessage('');
    try {
      const keys = await props.find(person.sub);
      if (keys === 'not-opened') {
        setMessage(
          `${person.name} hasn’t opened ${props.appName} yet. Ask them to open it once, then share again.`,
        );
      } else if (keys === 'changed') {
        setChanged(person);
      } else {
        await props.share(keys);
        setQ('');
      }
    } catch {
      setMessage('Couldn’t share the note. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function shareAnyway() {
    if (!changed) return;
    setBusy(true);
    try {
      await props.trust(await props.fetchKeys(changed.sub));
      const keys = await props.find(changed.sub);
      if (typeof keys !== 'string') await props.share(keys);
      setChanged(undefined);
    } catch {
      setMessage('Couldn’t share the note. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={props.onClose}
      header={<strong>Share “{props.note.title}”</strong>}
      title={`Share “${props.note.title}”`}
      footer={
        <Button variant="secondary" onClick={props.onClose}>
          Close
        </Button>
      }
    >
      <p>People you share with can read this note and every change to it.</p>
      <Input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Search people on this Sovereign"
        aria-label="Person"
      />
      <ul>
        {found.map((person) => (
          <li key={person.sub}>
            <Button variant="ghost" onClick={() => void choose(person)} disabled={busy}>
              {person.name}
            </Button>
          </li>
        ))}
      </ul>
      {message ? <Alert variant="info">{message}</Alert> : null}
      {changed ? (
        <Alert variant="warning" heading={`${changed.name}’s security details changed`}>
          This can happen when {changed.name} resets their account, or if someone tampered with the
          server. Check with {changed.name} before you share with them again.
          <div>
            <Button variant="secondary" onClick={() => setChanged(undefined)}>
              Not now
            </Button>
            <Button onClick={() => void shareAnyway()} loading={busy}>
              Share anyway
            </Button>
          </div>
        </Alert>
      ) : null}
      {others.length > 0 ? (
        <>
          <p>
            <strong>Shared with</strong>
          </p>
          <ul>
            {others.map((sub) => (
              <li key={sub}>
                {props.names[sub] ?? 'Someone'}{' '}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void props.unshare(sub)}
                  disabled={busy}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <small>
            Removing someone stops them reading changes. What they already read cannot be taken
            back.
          </small>
        </>
      ) : null}
    </Dialog>
  );
}
