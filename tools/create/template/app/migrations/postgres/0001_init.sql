-- What the SDK needs the app to keep (docs/using-the-sdk.md §2), and one table of the app's own to show it. The same tables as
-- migrations/sqlite, in PostgreSQL's types; statements are separated as the runner reads them.
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
CREATE TABLE notes (
  id         bigserial PRIMARY KEY,
  owner      text NOT NULL,
  body       text NOT NULL,
  created_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX notes_owner ON notes (owner, id DESC);
