import { nextAuth } from '@sovereignfs/sdk/next';
import { db } from './db';
import { files } from './files';
import { sovereign } from './sovereign';

/**
 * Sign-in for this app (docs/using-the-sdk.md). When a person deletes their account on the instance, core tells the app and keeps
 * telling it until it answers 200, which the SDK sends only after this function has finished. It must be safe to run twice.
 */
export const auth = () =>
  nextAuth(sovereign(), {
    onAccountDeleted: async ({ sub }) => {
      await db().query('DELETE FROM notes WHERE owner = $1', [sub]);
      // And the files they uploaded: their folder, which is gone once this has run, however often it does.
      await files().removeAll(sub);
      // The SDK has already ended the person's sessions and forgotten their refresh token.
    },
  });
