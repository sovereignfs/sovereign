import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import {
  DEFAULT_TENANT_ID,
  findWorkspaceRoot,
  getInstanceConfig,
  getPlatformDb,
  type InstanceConfig,
} from '@sovereignfs/db';
import { buildManifestIcons } from '@/src/manifest-icons';
import { resolveInstanceName } from '@/src/instance-name';

function staticManifest(): Response {
  const bytes = readFileSync(join(findWorkspaceRoot(), 'runtime', 'public', 'manifest.json'));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}

/**
 * Dynamic web app manifest (RFC 0027 Phases 1 & 3) — returns the PWA manifest
 * with the tenant's instance name, description, and icon URLs when instance
 * identity is configured; otherwise serves the static public/manifest.json
 * byte-for-byte so an unconfigured instance is indistinguishable from serving
 * the file directly. Excluded from the middleware session gate (browsers
 * fetch the manifest before the user logs in). The static file is also kept
 * for @ducanh2912/next-pwa build-time tooling.
 *
 * `/api/manifest` (not the RFC's literal `/manifest.webmanifest`) is the
 * established path — RFC 0081 (per-plugin installable PWA) already extends
 * this exact route with `/api/manifest/[pluginId]` and explicitly rejects a
 * `manifest.webmanifest` naming scheme; renaming here would contradict that.
 */
export async function GET(): Promise<Response> {
  let config: InstanceConfig | null = null;
  try {
    const pdb = await getPlatformDb();
    config = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
  } catch {
    // Instance config is cosmetic — serve a working manifest even on DB failure.
  }

  if (!config || (!config.instanceLogo && config.instanceName === resolveInstanceName(null))) {
    return staticManifest();
  }

  const instanceName = config.instanceName;
  const manifest = {
    name: instanceName,
    short_name: instanceName,
    description: `${instanceName} — your self-hosted workspace.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#09090b',
    theme_color: '#09090b',
    orientation: 'any',
    categories: ['productivity'],
    icons: buildManifestIcons(config),
    shortcuts: [
      {
        name: 'Launcher',
        short_name: 'Apps',
        description: 'Open the app launcher',
        url: '/launcher',
      },
      {
        name: 'Account',
        short_name: 'Account',
        description: 'Manage your profile and preferences',
        url: '/account',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
