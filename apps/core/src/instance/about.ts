import rootPackage from '../../../../package.json' with { type: 'json' };
import corePackage from '../../package.json' with { type: 'json' };
import type { Dialect } from '@sovereignfs/database';
import { getConfig } from '../config';

/** What an operator is told about the running instance at the foot of the launcher (core-app §3.8). */
export type InstanceDetails = {
  /** The platform version, the root `package.json`'s. */
  platform: string;
  /** Core's own version, `apps/core`'s. */
  core: string;
  database: string;
  /** Node's major and minor version, such as `24.15`. */
  node: string;
  /** How long this core process has been running, in seconds. */
  uptimeSeconds: number;
};

const DATABASE_NAMES: Record<Dialect, string> = {
  postgres: 'PostgreSQL',
  sqld: 'sqld',
  sqlite: 'SQLite',
};

/**
 * The versions, database and uptime of this core. It names what the instance runs, so it is for those who may open the
 * Console only: the caller checks `console:access` first, and nothing here is served to anyone else (the health endpoint
 * says no more than up or down). The versions are bundled when core is built, so they are the image's.
 */
export function instanceDetails(): InstanceDetails {
  return {
    platform: rootPackage.version,
    core: corePackage.version,
    database: DATABASE_NAMES[getConfig().dbDialect as Dialect] ?? 'unknown',
    node: process.versions.node.split('.').slice(0, 2).join('.'),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** A rough uptime, in its largest whole unit: "up 3 days", "up 2 hours", "up 1 minute", "up 40 seconds". */
export function formatUptime(seconds: number): string {
  const units: [number, string][] = [
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, unit] of units) {
    if (seconds >= size) return `up ${plural(Math.floor(seconds / size), unit)}`;
  }
  return `up ${plural(Math.max(0, Math.floor(seconds)), 'second')}`;
}

/** The line itself: "Sovereign 0.108.0 / 0.70.0 (Core) · PostgreSQL · Node 24.15 · up 3 days". */
export function formatInstanceDetails(details: InstanceDetails): string {
  return [
    `Sovereign ${details.platform} / ${details.core} (Core)`,
    details.database,
    `Node ${details.node}`,
    formatUptime(details.uptimeSeconds),
  ].join(' · ');
}
