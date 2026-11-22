-- What the SDK needs the app to keep (docs/using-the-sdk.md §2), and the notes, kept encrypted (ENCRYPTION.md).
CREATE TABLE sv_sessions (
  id         text PRIMARY KEY,
  kind       text NOT NULL,
  sub        text,
  sid        text,
  data       text NOT NULL,
  expires_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX sv_sessions_sub ON sv_sessions (sub);
--> statement-breakpoint
CREATE INDEX sv_sessions_sid ON sv_sessions (sid);
--> statement-breakpoint
CREATE INDEX sv_sessions_expires ON sv_sessions (expires_at);
--> statement-breakpoint
-- A person's refresh token, sealed, and the lease that lets one copy of the app refresh it at a time (lib/stores.ts).
CREATE TABLE sv_tokens (
  sub         text PRIMARY KEY,
  sealed      text NOT NULL,
  fingerprint text NOT NULL,
  lease_until bigint NOT NULL DEFAULT 0
);
--> statement-breakpoint
-- A note as the browser sent it: its title and its text, each encrypted with the note's own key, in base64url. The server opens neither.
CREATE TABLE notes (
  id         text PRIMARY KEY,
  owner      text NOT NULL,
  version    integer NOT NULL,
  meta       text NOT NULL,
  body       text NOT NULL,
  updated_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX notes_owner ON notes (owner);
--> statement-breakpoint
-- The note's key, sealed to each person who may read it, the owner included, and signed by the owner.
CREATE TABLE note_readers (
  note_id text NOT NULL,
  reader  text NOT NULL,
  record  text NOT NULL,
  PRIMARY KEY (note_id, reader)
);
--> statement-breakpoint
CREATE INDEX note_readers_reader ON note_readers (reader);
