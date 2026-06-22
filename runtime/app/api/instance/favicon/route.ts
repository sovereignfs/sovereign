import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import {
  DEFAULT_TENANT_ID,
  getPlatformDb,
  getInstanceConfig,
  setInstanceConfig,
} from '@sovereignfs/db';
import {
  INSTANCE_ACCEPTED_MIME,
  INSTANCE_MAX_BYTES,
  instanceAssetPath,
  instanceContentType,
  instanceDir,
} from '@/src/instance';

/**
 * GET /api/instance/favicon
 *
 * Serves the instance favicon. Excluded from middleware session gate.
 * Returns 404 when no favicon is configured (Next.js falls back to the static public/favicon.ico).
 */
export async function GET(): Promise<Response> {
  const filePath = instanceAssetPath('favicon');
  if (!filePath) return new NextResponse(null, { status: 404 });
  const bytes = readFileSync(filePath);
  return new Response(bytes, {
    headers: {
      'content-type': instanceContentType(filePath),
      'cache-control': 'public, max-age=86400',
    },
  });
}

/**
 * POST /api/instance/favicon
 *
 * Upload a new favicon. Admin-gated. Stores at data/instance/favicon.<ext>.
 */
export async function POST(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role');
  if (!role || role === 'platform:user' || role === 'platform:auditor') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no file provided' }, { status: 400 });
  }
  if (file.size > INSTANCE_MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 2 MB)' }, { status: 400 });
  }
  const ext = INSTANCE_ACCEPTED_MIME[file.type];
  if (!ext) {
    return NextResponse.json({ error: `unsupported type ${file.type}` }, { status: 400 });
  }

  const dir = instanceDir();
  mkdirSync(dir, { recursive: true });
  const prior = instanceAssetPath('favicon');
  if (prior) {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(prior);
  }
  const dest = join(dir, `favicon.${ext}`);
  writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  const url = '/api/instance/favicon';
  const pdb = await getPlatformDb();
  const current = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
  await setInstanceConfig(pdb, DEFAULT_TENANT_ID, { ...current, instanceFavicon: url });

  return NextResponse.json({ url });
}

/**
 * DELETE /api/instance/favicon
 *
 * Remove the uploaded favicon. Sets DB field to null so the static favicon.ico is used.
 */
export async function DELETE(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role');
  if (!role || role === 'platform:user' || role === 'platform:auditor') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const prior = instanceAssetPath('favicon');
  if (prior) {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(prior);
  }

  const pdb = await getPlatformDb();
  const current = await getInstanceConfig(pdb, DEFAULT_TENANT_ID);
  await setInstanceConfig(pdb, DEFAULT_TENANT_ID, { ...current, instanceFavicon: null });

  return NextResponse.json({ ok: true });
}
