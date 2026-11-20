-- Web Push (@sovereignfs/push): the devices that get notifications, each for the account that turned them on, and the pushes waiting to
-- be sent. A device's keys are sealed by the app (lib/crypto.ts); a waiting push names its device and goes with it.

CREATE TABLE push_devices (
  endpoint text PRIMARY KEY,
  account  text NOT NULL,
  keys     text NOT NULL,
  saved_at bigint NOT NULL
);
CREATE INDEX push_devices_account ON push_devices (account, saved_at);

CREATE TABLE push_outbox (
  id            text PRIMARY KEY,
  account       text NOT NULL,
  endpoint      text NOT NULL REFERENCES push_devices (endpoint) ON DELETE CASCADE,
  message       jsonb NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  due_at        bigint NOT NULL,
  claimed_until bigint NOT NULL DEFAULT 0,
  expires_at    bigint NOT NULL
);
CREATE INDEX push_outbox_due ON push_outbox (due_at, claimed_until);
CREATE INDEX push_outbox_endpoint ON push_outbox (endpoint);
CREATE INDEX push_outbox_account ON push_outbox (account);
