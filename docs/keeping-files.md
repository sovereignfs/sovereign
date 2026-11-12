# Keeping people's files

How an app keeps the files people upload to it, and what an instance does about them. The design is
[RFC 0004](rfcs/0004-file-storage.md); the contract is [`contracts/app-manifest.md`](../contracts/app-manifest.md) §2.7; core keeps its
own the same way ([core-app §4.6](specs/core-app.md)). `npm create @sovereignfs app` makes an app that already does all of this, so
start there and change it.

## What you get

- **A folder of your own.** On an instance your app is given one folder of a shared volume, at `/data/s3/<name>`, and nothing else of
  the disk: not core's files, not another app's. Running it yourself, you mount a volume at the same path (`compose.yml` in the template).
- **A folder for each person**, named by their `session.sub`, holding each file under an id the store makes. The name the person gave
  is kept for showing and is never part of a path.
- **A quota for each person**, in your app: megabytes and files, from `<PREFIX>_STORAGE_QUOTA_MB` and `<PREFIX>_STORAGE_FILE_QUOTA`
  (200 GB and 1000 unless the operator sets them). Room is reserved before a byte is written and given back if the write fails, so two
  uploads at once cannot together pass it.
- **Safe serving.** What a file is comes from its bytes, never its name. Images are shown, and everything else is downloaded, with
  `nosniff` and a policy that lets nothing in it run, so an uploaded page or SVG is never script on your address.
- **Range requests**, so a video can be sought in and a download resumed.
- **Backups.** `sv backup` carries the folder, whole or by app, and `sv restore` puts it back; deleting an app with `--purge` deletes it.

## In your app

1. **The manifest** says it: `"manifest": 3` and `"storage": true`. Nothing in `data` may be `/data/s3` or inside it.
2. **The store**, once, from the environment (`lib/files.ts` in the template):

   ```ts
   import { defineConfig } from '@sovereignfs/config';
   import { createFileStore, storageVariables } from '@sovereignfs/storage';

   const config = defineConfig({ prefix: 'NOTES', variables: { ...storageVariables } });
   export const files = () =>
     createFileStore(config.load(), { prefix: 'NOTES', defaultPath: '/data/s3/notes' });
   ```

3. **Routes**, each asking who is calling. The person is always the session's, and never anything a request names:

   ```ts
   const record = await files().put(session.sub, request.body, { name, size }); // 201, or a StorageError
   return files().serve(session.sub, id, request); // 200 or 206, or a StorageError (not_found)
   await files().remove(session.sub, id);
   const { files: kept, usage } = {
     files: await files().list(session.sub),
     usage: await files().usage(session.sub),
   };
   ```

   A route that changes something also checks where the request came from, since the cookie is sent from anywhere (`refuseCrossOrigin`).

4. **Refusals** are a `StorageError` with a `code` (`too_large`, `over_quota`, `not_found`, `invalid`, `empty`), a `status` and a message a
   person can act on. Show the message; do not turn it into a crash.
5. **Delete them with the person.** In `onAccountDeleted`, call `files().removeAll(sub)`: core tells your app until it answers, and it
   must be safe to run twice.

## What to know

- **Send the size when you have it** (`Content-Length`): the store can then refuse a file that cannot fit before reading a byte. Without
  it an upload reserves all the room the person has left, so their uploads of unknown size run one after the other.
- **More than one process?** The usage record is kept beside the files and ordered within one process. Pass a `usage` store backed by
  your database instead (`createFileStore(settings, { usage })`).
- **Nothing is shared.** A file is served only to its owner, or through an address you sign for them that runs out within the hour
  (`signedQuery`, `signedFor`, with `<PREFIX>_STORAGE_SIGNING_KEY`). Sharing between people is not built.
- **Only the disk for now.** `<PREFIX>_STORAGE_DRIVER` is `fs`. S3-compatible storage and a git repository of the person's own are
  planned ([RFC 0004](rfcs/0004-file-storage.md) §3).
- **The image makes the folder.** `RUN mkdir -p /data/s3/<name> && chown -R node:node /data` before `USER node`, or Docker makes a volume
  of it owned by root and the app cannot write.
