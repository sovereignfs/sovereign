import { NextResponse } from 'next/server';

/**
 * One-time enrollment: issues a per-instance API key used to authenticate
 * subsequent /v1/push calls. See RFC 0087's "Relay authentication" section
 * for the (deliberately minimal — abuse prevention, not strong
 * authorization) design intent.
 *
 * Not yet implemented — workstream 0005 leg 2.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'not_implemented',
      message: 'Push relay is not yet implemented — see RFC 0087, workstream 0005 leg 2.',
    },
    { status: 501 },
  );
}
