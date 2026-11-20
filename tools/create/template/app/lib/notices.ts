import { coreNotices, userIdForSub } from '@sovereignfs/auth/core';
import pkg from '../package.json' with { type: 'json' };
import { required } from './config';
import { files } from './files';
import { signIn } from './sign-in';
import { sovereign } from './sovereign';
import { tokenStore } from './stores';

/**
 * Core's two notices (auth.md §8): a logout ends this app's sessions of that core session, or of that person; an account deleted at the
 * instance deletes the person here first, and core keeps telling the app until it has. It must be safe to run twice.
 */
export async function notices() {
  const { auth, database } = await signIn();
  return coreNotices({
    database,
    auth,
    coreUrl: required('__PREFIX___CORE_URL'),
    clientId: required('__PREFIX___CORE_CLIENT_ID'),
    dropRefreshToken: async (sub) => {
      await tokenStore.delete?.(sub);
    },
    onAccountDeleted: async (sub) => {
      const userId = await userIdForSub(database, sub);
      if (!userId) return;
      await database.run('DELETE FROM notes WHERE owner = ?', [userId]);
      // And the files they uploaded: their folder, which is gone once this has run, however often it does.
      await files().removeAll(userId);
      await (await auth.$context).internalAdapter.deleteUser(userId);
    },
  });
}

/**
 * Core's request for a person's part of their export from the instance (core-app §4.7.2): what this app keeps of them, and nothing of
 * anyone else. The SDK checks core's signed request and writes the format; a person with no account here gets an empty part.
 */
export async function exportPart(request: Request) {
  const { database } = await signIn();
  return sovereign().auth.handleExportRequest(
    request,
    { prefix: '__PREFIX_LOWER__', version: pkg.version },
    async ({ sub, writer }) => {
      const userId = await userIdForSub(database, sub);
      if (!userId) return;
      const { rows } = await database.run(
        'SELECT id, body, created_at FROM notes WHERE owner = ? ORDER BY id',
        [userId],
      );
      await writer.addRecords('apps/__PREFIX_LOWER__/records/notes.jsonl', 'notes', rows);
      const kept = await files().list(userId);
      // What each file is (its name, type and size), then the files themselves.
      await writer.addRecords('apps/__PREFIX_LOWER__/records/files.jsonl', 'files', kept);
      for (const record of kept) {
        const { body } = await files().get(userId, record.id);
        await writer.addFile(`apps/__PREFIX_LOWER__/files/${record.id}`, body, record.size);
      }
    },
  );
}
