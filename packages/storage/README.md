# @sovereignfs/storage

The files people upload to a [Sovereign](https://github.com/sovereignfs/sovereign) app, or to core: a folder per person, a quota per
person, served only to them. The design is [RFC 0004](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0004-file-storage.md).

```ts
import { defineConfig } from '@sovereignfs/config';
import {
  createFileStore,
  fileResponse,
  storageVariables,
  StorageError,
} from '@sovereignfs/storage';

const config = defineConfig({ prefix: 'NOTES', variables: { ...storageVariables } }).load();
const files = createFileStore(config, { prefix: 'NOTES', defaultPath: '/data/s3/notes' });

const record = await files.put(sub, request.body, { name: 'photo.png', size: 52_000 });
return fileResponse(await files.get(sub, record.id));
```

- **Every method takes the person's `sub` from your own session,** never from a request. A file of someone else's is `not_found`.
- **Quotas are per person:** `<PREFIX>_STORAGE_QUOTA_MB` (default 204800, 200 GB) and `<PREFIX>_STORAGE_FILE_QUOTA` (default 1000). Room is
  reserved before a byte is written. Pass `size` when the request says it: without it the upload reserves all the room left, so two
  uploads of unknown size from one person run one after the other.
- **A refusal is a `StorageError`** with a `code` (`too_large`, `over_quota`, `not_found`, `invalid`, `empty`), a `status` and a message a
  person can act on.
- **What a file is comes from its bytes.** Images are shown; everything else is downloaded, so nothing uploaded runs as script.
- **Signed addresses** (`signedQuery`, `signedFor`) serve a file without a session for a few minutes, when `<PREFIX>_STORAGE_SIGNING_KEY`
  is set.
- **More than one process?** The usage record is kept beside the files and ordered within one process. Pass a `usage` store backed by your
  database instead.

Licence: MPL-2.0.
