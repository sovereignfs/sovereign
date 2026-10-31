-- What the SDK needs the app to keep (docs/using-the-sdk.md §2), and one table of the app's own to show it.

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

CREATE TABLE notes (
  id         bigserial PRIMARY KEY,
  owner      text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_owner ON notes (owner, id DESC);
