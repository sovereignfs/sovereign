import type { NextRequest } from 'next/server';

// The runtime rewrites /api/<slug>/<path> → <routePrefix>/serve/<slug>/<path>
// because this plugin has "apiProvider": true in manifest.json. The rewrite
// happens *before* the session gate, so external callers authenticate themselves
// (for example with an API key header) rather than relying on the platform
// session cookie.
//
// Only one apiProvider may be installed per Sovereign instance; the generate
// step enforces this before route generation.

type Params = { params: Promise<{ slug: string; path: string[] }> };

function pathKey(path: string[]): string {
  return path.join('/') || 'index';
}

function apiKeyState(req: NextRequest): 'missing' | 'provided' {
  return req.headers.get('authorization')?.startsWith('Bearer ') ? 'provided' : 'missing';
}

export async function GET(req: NextRequest, { params }: Params) {
  const { slug, path } = await params;
  const key = pathKey(path);

  if (key === 'status') {
    return Response.json({
      ok: true,
      route: `/api/${slug}/status`,
      delegatedTo: `/example-api/serve/${slug}/status`,
      auth: apiKeyState(req),
      message: 'Public API delegation is active.',
    });
  }

  return Response.json({
    ok: true,
    method: 'GET',
    slug,
    path,
    auth: apiKeyState(req),
    examples: [`/api/${slug}/status`, `/api/${slug}/echo`],
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { slug, path } = await params;
  const body: unknown = await req.json().catch(() => null);

  if (body === null) {
    return Response.json(
      {
        ok: false,
        error: 'Expected a JSON request body.',
        example: { title: 'Hello from a delegated API route' },
      },
      { status: 400 },
    );
  }

  return Response.json({
    ok: true,
    method: 'POST',
    slug,
    path,
    auth: apiKeyState(req),
    received: body,
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { slug, path } = await params;
  return Response.json(
    {
      ok: false,
      error: 'This example implements GET and POST only.',
      method: req.method,
      slug,
      path,
    },
    { status: 405, headers: { Allow: 'GET, POST' } },
  );
}

export const DELETE = PUT;
