import type { NextRequest } from 'next/server';

// The runtime rewrites /api/<slug>/<path> → <routePrefix>/serve/<slug>/<path>
// when this plugin has "apiProvider": true in manifest.json. The rewrite happens
// *before* the session gate, so external callers authenticate themselves (e.g.
// with an API key header) rather than relying on the platform session cookie.
//
// To activate: add "apiProvider": true to manifest.json. Only one apiProvider
// may be installed per Sovereign instance (the generate step enforces this).

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path } = await params;
  return Response.json({ ok: true, slug, path });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path } = await params;
  const body: unknown = await req.json().catch(() => null);
  return Response.json({ ok: true, slug, path, body });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path } = await params;
  const body: unknown = await req.json().catch(() => null);
  return Response.json({ ok: true, slug, path, body });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path } = await params;
  return Response.json({ ok: true, slug, path });
}
