# The export format

|             |                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**  | Specified ([RFC 0008](../docs/rfcs/0008-exports-and-backups.md)); written and read by `@sovereignfs/export`                                   |
| **Format**  | `1`                                                                                                                                           |
| **Used by** | core's exports ([core-app §4.7](../docs/specs/core-app.md)), an app's answer to core ([sdk §9.1](../docs/specs/sdk.md)), an app's own exports |

One format for every export Sovereign makes: an owner's export of core, an operator's export of an app, a person's export from core or
from an app, and the part an app gives core for a person's export. It is what is kept, not a way to restore: nothing in this version is
imported.

## 1. The archive

An export is a **tar archive** (POSIX, `pax` headers for names longer than `ustar` holds), uncompressed, written as a stream.

1. Its **first entry is `export.json`** (§2): what the export is.
2. Then the **data**, as regular files under the paths of §3. No directory entries are needed, and none other than regular files are
   allowed: no links, devices or FIFOs.
3. Its **last entry is `contents.json`** (§4): every file before it, with its SHA-256, and the parts. It comes last because a writer
   streams and knows the hashes only once each file is written.

Every path is relative, uses `/`, holds no `.` or `..` segment, no empty segment, no NUL and no backslash, and is at most 1024 bytes. No
path appears twice. Names are case-sensitive.

**A person's export** MAY be offered as a **zip** of the same entries in the same order (stored or deflated, ZIP64 where needed): people
open zips. Everything this document says of the tar holds for the zip. An owner's or an operator's export is always a tar.

**An encrypted export** is the tar, encrypted with [age](https://age-encryption.org/v1) to X25519 recipients (`age1…`), and named
`….tar.age`. Nothing is outside the encryption: who it was encrypted to is recorded by whoever made it, not in the file.

**File names** are `sovereign-<host>-<YYYYMMDDTHHMMSSZ>-<kind>.<ext>`, with the app's `prefix` after `<host>` for an app's export, and
`-2`, `-3`… when two are made in one second.

## 2. `export.json`

```json
{
  "format": 1,
  "kind": "person",
  "producer": { "name": "core", "version": "0.80.0" },
  "instance": { "id": "b6c1…", "url": "https://sovereign.example.org" },
  "app": "tusk",
  "sub": "8f1e…",
  "takenAt": "2026-11-20T10:00:00.000Z"
}
```

| Field      | Required     | Meaning                                                                                                          |
| ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `format`   | yes          | `1`. A reader refuses a format it does not know                                                                  |
| `kind`     | yes          | `instance` (an owner's export of core), `app` (an operator's export of one app), or `person` (one person's data) |
| `producer` | yes          | What wrote it: `core`, or the app's `prefix`, and its version                                                    |
| `instance` | with core    | The instance's id and its address when it was taken. Absent from an export by an app with no core                |
| `app`      | for an app   | The app's `prefix`, for `kind: "app"` and for an app's part of a person's export                                 |
| `sub`      | for `person` | The person, as the producer knows them: core's `sub`, or the app's own when it has no core                       |
| `takenAt`  | yes          | When it began, in UTC, ISO 8601 with milliseconds                                                                |

No other field is allowed. `export.json` names nobody but by `sub`.

## 3. The data

```
export.json
core/records/<kind>.jsonl           core's records (kind instance, or core's part of a person's export)
core/files/<path>                   core's files, in @sovereignfs/storage's layout
apps/<prefix>/records/<kind>.jsonl  an app's part of a person's export
apps/<prefix>/files/<path>
contents.json
```

An export by an app (`kind: "app"`, or a person's export from an app with no core) uses `apps/<prefix>/` for its own data. The part an
app answers core with uses the same `apps/<prefix>/` paths, so core places it as it comes.

- **Records** are [JSON Lines](https://jsonlines.org/): one JSON object per line, UTF-8, `\n` after each, in a file per kind of record.
  A kind is lower case, `[a-z][a-z0-9_]*`. Fields are the producer's, named as it names them; a time is ISO 8601 in UTC; bytes are
  base64url. A record of something kept end-to-end encrypted is its stored envelope, unchanged ([RFC 0005](../docs/rfcs/0005-end-to-end-encryption.md)
  §1.2, §1.3), and its file is marked so in `contents.json`.
- **Files** are the bytes as stored, with the store's own record beside each, as `@sovereignfs/storage` keeps them. A file kept
  end-to-end encrypted is its ciphertext.

## 4. `contents.json`

```json
{
  "parts": [
    { "name": "core", "status": "complete" },
    { "name": "tusk", "status": "complete", "version": "1.4.0" },
    { "name": "ledger", "status": "missing", "reason": "unreachable" }
  ],
  "records": [
    {
      "path": "core/records/notifications.jsonl",
      "kind": "notifications",
      "count": 42,
      "endToEnd": false
    }
  ],
  "files": [{ "path": "core/records/notifications.jsonl", "bytes": 10240, "sha256": "9f86…" }]
}
```

- **`parts`**: one entry for each producer whose data the export was meant to hold, in the order written. `status` is `complete`, or
  `missing` with a `reason`: `not_supported` (the app declares no export address), `unreachable` (no answer, or not in time),
  `refused` (an answer other than `200`), `too_large`, or `invalid` (its answer failed its own check). A part that is missing has no
  files.
- **`records`**: each records file, its kind, how many lines, and whether its records are end-to-end envelopes.
- **`files`**: every entry of the archive between `export.json` and `contents.json`, in order, with its size and its SHA-256 in
  lower-case hex. `export.json` and `contents.json` are not listed.

## 5. Checking an export

A reader MUST refuse an export, and use none of it, unless:

1. the first entry is `export.json`, it parses, its `format` is one it knows, and its fields are as §2 says;
2. every entry is a regular file whose path follows §1;
3. the last entry is `contents.json`, it parses, and it lists every entry between the two, in order, each with the size and the SHA-256
   of its bytes, and lists nothing else;
4. every records file listed in `records` is in `files`, and a missing part has none.

An encrypted export is decrypted first, as a stream, and checked as it is read.

## 6. What an export never holds

Whatever its kind: a password's stored hash, a TOTP secret or a backup code, a passkey's credential, a session, a session's token, an
access or refresh token, a verification or reset token, an app's client secret in the clear, and anything of another person beyond the
`sub` the producer already shows the person (a shared document names its other readers by `sub`). Core's sections that make each kind
of export say what it holds ([core-app §4.7](../docs/specs/core-app.md)).

## 7. Changing the format

`format` is a whole number, raised by any change a reader of the current one could misread. A reader refuses a format it does not know,
and names the version of `@sovereignfs/export` that reads it.
