# @sovereignfs/export

The one export format of [Sovereign](https://github.com/sovereignfs/sovereign): what an owner, an operator or a person downloads to
keep their data. It is specified in [`contracts/export.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/export.md);
this package writes it, checks it and encrypts it. Core uses it, and so does any app, with core or without.

Node 22.3+, ESM; its `/browser` entry writes in a page. It never reads a database: you give it records and file streams.

## Writing an export

```ts
import { ExportWriter, encryptTo } from '@sovereignfs/export';

const writer = new ExportWriter({
  head: {
    format: 1,
    kind: 'person',
    producer: { name: 'tusk', version: '1.4.0' },
    app: 'tusk',
    sub,
    takenAt: new Date().toISOString(),
  },
  archive: 'zip', // a person's export may be a zip; anything encrypted is a tar
});

// Read `writer.readable` while adding: each call resolves as its bytes are taken.
const done = writer.readable.pipeTo(destination);
writer.addPart({ name: 'tusk', status: 'complete', version: '1.4.0' });
await writer.addRecords('apps/tusk/records/tasks.jsonl', 'tasks', tasksOf(sub));
await writer.addFile('apps/tusk/files/attachment.pdf', fileStream, size);
await writer.finish();
await done;
```

`export.json` is written first and `contents.json`, with each file's SHA-256, last. A file whose size is not given is held in a temporary
file first, since a tar needs the size before the bytes.

## Writing an export in a page

An app whose data only the browser can open (it is encrypted end to end) writes a person's export there, from
`@sovereignfs/export/browser`, which imports no `node:` module. The data is in memory, as the page holds it; the archive is the same,
byte for byte, as `ExportWriter` writes from the same records and files.

```ts
import { BrowserExportWriter, exportFileName } from '@sovereignfs/export/browser';

const writer = new BrowserExportWriter({ head, archive: 'zip' });
writer.addPart({ name: 'shopper', status: 'complete', version: '0.4.0' });
writer.addRecords('apps/shopper/records/lists.jsonl', 'lists', openedLists);
const { bytes } = await writer.finish();
// Give `bytes` to the person as a file (a Blob and a download link).
```

An owner's or operator's export is encrypted as it is written:

```ts
const sealed = await encryptTo(parseRecipients(savedLine), writer.readable);
```

## Reading and checking one

```ts
import { decryptWith, readExport } from '@sovereignfs/export';

const { head, contents } = await readExport(await decryptWith([identity], file), {
  onFile: async ({ path, body }) => {
    /* write it somewhere temporary; keep it only once readExport resolves */
  },
});
```

`readExport` refuses, with an `ExportError` whose `code` says why, anything the contract does not allow: an entry that is not a regular
file, a path outside the archive, a changed byte, a file listed and not there or there and not listed, an unknown `format`.

## The age implementation

Encryption is [age](https://age-encryption.org/v1), through [`age-encryption`](https://www.npmjs.com/package/age-encryption) (typage, by
age's author): it is maintained, it encrypts and decrypts as streams, it is what Sovereign's toolkit already uses for backups, and what it
writes opens with the `age` command. Only X25519 recipients (`age1…`) are accepted.

## Licence

MPL-2.0.
