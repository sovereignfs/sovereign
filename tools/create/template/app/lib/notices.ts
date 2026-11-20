import { coreNotices, userIdForSub } from '@sovereignfs/auth/core';
import { required } from './config';
import { files } from './files';
import { signIn } from './sign-in';
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
