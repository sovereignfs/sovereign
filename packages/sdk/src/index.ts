import * as auth from './auth';
import { data } from './data';
import * as db from './db';
import * as mailer from './mailer';
import * as platform from './platform';
import { activity, events, notifications, storage } from './unimplemented';

/**
 * The Sovereign SDK — the only contract between a plugin and the platform.
 *
 * The full v1 surface — `auth`, `db`, `mailer`, `platform` — is implemented
 * (`auth`/`mailer` in Task 0.4.02; `platform`/`db` in Task 0.5.x).
 * `data` (cross-plugin data sharing, RFC 0002), `activity` (activity log,
 * RFC 0005), `storage`, `notifications`, and `events` are reserved — declared
 * but not yet implemented.
 */
export const sdk = {
  auth,
  data,
  db,
  mailer,
  platform,
  storage,
  notifications,
  events,
  activity,
};

export { NotImplementedError, NotAuthenticatedError, ConsentRequiredError } from './errors';
export type { DataContractRef, DataContractResolver } from './data';
export type {
  Session,
  SessionUser,
  ActiveSession,
  ChangePasswordInput,
  MailOptions,
  PlatformConfig,
  ActivityLogEntry,
  DrizzleClient,
} from './types';
