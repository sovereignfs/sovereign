-- What the SDK needs the app to keep (docs/using-the-sdk.md §2), and the notes, kept encrypted (ENCRYPTION.md).

CREATE TABLE sv_sessions (
  id         text PRIMARY KEY,
  kind       text NOT NULL,
  sub        text,
  sid        text,
  data       jsonb NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX sv_sessions_sub ON sv_sessions (sub);
CREATE INDEX sv_sessions_sid ON sv_sessions (sid);
CREATE INDEX sv_sessions_expires ON sv_sessions (expires_at);

CREATE TABLE sv_tokens (
  sub         text PRIMARY KEY,
  sealed      text NOT NULL,
  fingerprint text NOT NULL
);

-- A note as the browser sent it: its title and its text, each encrypted with the note's own key. The server opens neither.
CREATE TABLE notes (
  id         text PRIMARY KEY,
  owner      text NOT NULL,
  version    integer NOT NULL,
  meta       bytea NOT NULL,
  body       bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_owner ON notes (owner);

-- The note's key, sealed to each person who may read it, the owner included, and signed by the owner.
CREATE TABLE note_readers (
  note_id text NOT NULL,
  reader  text NOT NULL,
  record  text NOT NULL,
  PRIMARY KEY (note_id, reader)
);
CREATE INDEX note_readers_reader ON note_readers (reader);
