import { nextAuth } from '@sovereignfs/sdk/next';
import pkg from '../package.json' with { type: 'json' };
import { db } from './db';
import { files } from './files';
import { notes } from './notes';
import { pushStore } from './push';
import { sovereign } from './sovereign';

/**
 * Sign-in for this app (docs/using-the-sdk.md). When a person deletes their account on the instance, core tells the app and keeps
 * telling it until it answers 200, which the SDK sends only after this function has finished. It must be safe to run twice.
 */
export const auth = () =>
  nextAuth(sovereign(), {
    onAccountDeleted: async ({ sub }) => {
      // Their notes and the keys sealed to them for others' notes (RFC 0005 §8): with the keys gone, nothing of theirs opens.
      await notes().deleteAll(sub);
      // And the files they uploaded: their folder, which is gone once this has run, however often it does.
      await files().removeAll(sub);
      // And the devices they get notifications on, with what was waiting for them.
      await pushStore().removeAccount(sub);
      // The SDK has already ended the person's sessions and forgotten their refresh token.
    },
    // A person's part of their export (core-app §4.7.2): their notes as stored, still encrypted, and the keys sealed to them, so the
    // export opens with their own keys and nobody else's.
    onExport: {
      prefix: '__PREFIX_LOWER__',
      version: pkg.version,
      handler: async ({ sub, writer }) => {
        const notes = await db().query(
          "SELECT id, version, encode(meta, 'base64') AS meta, encode(body, 'base64') AS body, updated_at FROM notes WHERE owner = $1 ORDER BY id",
          [sub],
        );
        await writer.addRecords('apps/__PREFIX_LOWER__/records/notes.jsonl', 'notes', notes.rows, {
          endToEnd: true,
        });
        const readers = await db().query(
          'SELECT * FROM note_readers WHERE reader = $1 ORDER BY note_id',
          [sub],
        );
        await writer.addRecords(
          'apps/__PREFIX_LOWER__/records/note_readers.jsonl',
          'note_readers',
          readers.rows,
          { endToEnd: true },
        );
        const kept = await files().list(sub);
        await writer.addRecords('apps/__PREFIX_LOWER__/records/files.jsonl', 'files', kept);
        for (const record of kept) {
          const { body } = await files().get(sub, record.id);
          await writer.addFile(`apps/__PREFIX_LOWER__/files/${record.id}`, body, record.size);
        }
      },
    },
  });
