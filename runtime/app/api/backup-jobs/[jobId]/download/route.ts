import { NextResponse } from 'next/server';
import { getBackupJob } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { createReadStream, statSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';

const TOKEN_VERSION = 'sv1';
const SIGNING_SECRET_ENV = ['SOVEREIGN_AUTH_SECRET', 'AUTH_SECRET'] as const;

function signingSecret(): string {
  for (const key of SIGNING_SECRET_ENV) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error('SOVEREIGN_AUTH_SECRET or AUTH_SECRET is required for backup download tokens.');
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

interface DownloadTokenPayload {
  version: typeof TOKEN_VERSION;
  jobId: string;
  expiresAt: number;
}

function verifyDownloadToken(token: string): DownloadTokenPayload {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new Error('Invalid download token signature.');
  }
  const parsed = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as DownloadTokenPayload;
  if (parsed.version !== TOKEN_VERSION) throw new Error('Unsupported download token version.');
  if (parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('Download token has expired.');
  }
  return parsed;
}

interface RouteParams {
  params: Promise<{ jobId: string; token: string }>;
}

/**
 * Serve a backup archive via a signed token (RFC 0084, epic task 8.16).
 * The token is HMAC-signed, embeds the job ID, has a configurable TTL
 * (default 48h), and cannot be extended or widened by editing it.
 * Not part of the session-gated middleware surface by design: signed URLs
 * must work for direct downloads without forwarding cookies.
 *
 * The archive file is streamed from disk (`createReadStream`) rather than
 * buffered — the route never loads the whole archive into memory.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { jobId, token } = await params;

  // Verify the HMAC-signed token
  let payload: DownloadTokenPayload;
  try {
    payload = verifyDownloadToken(token);
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (payload.jobId !== jobId) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const pdb = await getPlatformDb();
  const job = await getBackupJob(pdb, jobId);

  if (!job) return new NextResponse('Not Found', { status: 404 });
  if (job.status !== 'complete') return new NextResponse('Not Found', { status: 404 });

  const archivePath = join(findWorkspaceRoot(), 'data', 'backups', job.archivePath);
  // For now, assume the file exists — in production, we'd verify it exists
  // and handle missing files gracefully

  // Stream the file from disk using ReadableStream
  const stream = createReadStream(archivePath);
  const stats = statSync(archivePath);

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stats.size),
      'Content-Disposition': `attachment; filename="${job.archivePath.split('/').pop()}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
