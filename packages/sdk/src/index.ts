import * as auth from './auth';
import { activity } from './activity';
import { data } from './data';
import * as db from './db';
import * as mailer from './mailer';
import * as platform from './platform';
import { events, notifications, storage } from './unimplemented';

/**
 * The Sovereign SDK — the only contract between a plugin and the platform.
 *
 * **Stable surface (covered by the v1.0.0 semver guarantee** — see
 * `docs/sdk-stability.md`): `auth`, `db`, `mailer`, `platform`. These are
 * implemented and will not change in breaking ways without a major bump +
 * migration note (NFR-04).
 *
 * **Experimental / reserved (NOT covered by the stability guarantee):** `data`
 * (cross-plugin data sharing, RFC 0002), `activity` (activity log, RFC 0005),
 * `storage`, `notifications`, `events`. `data` and `activity` are implemented;
 * `storage`, `notifications`, and `events` throw `NotImplementedError` until
 * their backing mechanisms ship. Their shape may change before they stabilise.
 */
export const sdk = {
  // Stable (v1.0.0).
  auth,
  db,
  mailer,
  platform,
  // Experimental / reserved — throw until implemented; shape may change.
  data,
  storage,
  notifications,
  events,
  activity,
};

export { provideHost } from './host';
export type { SdkHost } from './host';
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
