import * as auth from './auth';
import { activity } from './activity';
import { data } from './data';
import * as db from './db';
import { env } from './env';
import * as mailer from './mailer';
import { notifications } from './notifications';
import * as platform from './platform';
import { portability } from './portability';
import { billing, events, storage } from './unimplemented';

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
 * `portability` (user data export/import, RFC 0007), `env` (plugin-scoped env
 * vars, RFC 0018), `notifications` (notification center, RFC 0015),
 * `billing` (plugin monetization / entitlement gating, RFC 0003), `storage`,
 * `events`. `data`, `activity`, `portability`, `env`, and `notifications` are
 * implemented; `billing`, `storage`, and `events` throw `NotImplementedError`
 * until their backing mechanisms ship. Their shape may change before they stabilise.
 */
export const sdk = {
  // Stable (v1.0.0).
  auth,
  db,
  mailer,
  platform,
  // Experimental / reserved — shape may change; some throw until implemented.
  data,
  storage,
  notifications,
  events,
  activity,
  portability,
  env,
  billing,
};

export { provideHost } from './host';
export type { SdkHost } from './host';
export {
  NotImplementedError,
  NotAuthenticatedError,
  ConsentRequiredError,
  EntitlementRequiredError,
} from './errors';
export type { DataContractRef, DataContractResolver } from './data';
export type {
  ExportContext,
  ImportContext,
  PluginExportSection,
  ExportResolver,
  ImportHandler,
} from './portability';
export type {
  Session,
  SessionUser,
  ActiveSession,
  ChangePasswordInput,
  MailOptions,
  PlatformConfig,
  ActivityLogEntry,
  DrizzleClient,
  SendNotificationInput,
} from './types';
