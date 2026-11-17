# Encryption in **TITLE**

This app was made with `--encryption`: its notes are encrypted in the browser, so that someone who reads the server, its database or a
backup cannot read them. **Not yet audited:** Sovereign's encryption has not yet been reviewed by a cryptographer or audited, so say so
wherever you describe it, and never promise more than this file does. The rules are Sovereign's guide, _Encrypting an app's data_.

## What it protects, and what it does not

- **Protected:** a note's title and text, from anyone who reads the server's disk, its database or a backup.
- **Not protected:** anything against whoever runs the server, since the pages come from it; files (the Files card says so); and who
  shares with whom, sizes and times, which the server sees.

## How it works

- **The app's key** comes from the person's Sovereign once each browser session (`appKeys` from `@sovereignfs/sdk/keys`): `/keys/return`
  is the key return address in `sovereign.manifest.json` (`encryption`), and the operator allows the app when hosting it.
- **Each note has a key of its own**, sealed to each person who may read it, the owner included, and signed by the owner (`share`). Its
  title and text are encrypted with it (`encryptBytes`), bound to the note's id and version.
- **The server** (`lib/notes.ts`, `app/api/notes`) stores what the page sends and opens nothing. Every statement names the person.
- **Sharing** looks people up in the instance's Directory and checks their keys against their account's signature (`checkPerson`). A
  person whose keys changed is shown as such, and is shared with only if the person sharing says so.
- **Removing someone** makes a new key for the note, sealed only to those who remain. What they already read cannot be taken back, and
  the dialog says so.
- **A deleted account** takes its notes and every key sealed to it (`lib/auth.ts`).

## Rules to keep as the app grows (RFC 0005 §8)

- Nothing of a note in a notification, an activity entry or mail sent through core.
- Never show ciphertext: show `LockedState` where the browser is locked.
- Nothing of a note in a log, an error or analytics.
