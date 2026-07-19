import { NextResponse } from 'next/server';
import { createMailer } from '@sovereignfs/mailer';
import { checkAdminKey } from '@/src/admin-guard';
import { getPlatformDb } from '@/src/db';
import { resolveEffectiveMailerConfig } from '@/src/smtp-settings';

/**
 * Sends a real test email through the currently effective SMTP settings
 * (Console-stored values overriding env, resolved fresh — same as any other
 * platform email). No existing admin route sends real test traffic
 * (provider-configs' "test" action only checks field completeness), so this
 * is new, narrow surface: one email, to an address the caller supplies.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as { to?: string };
  if (!body.to || !body.to.includes('@')) {
    return NextResponse.json({ error: 'A valid "to" email address is required' }, { status: 400 });
  }

  const pdb = await getPlatformDb();
  const config = await resolveEffectiveMailerConfig(pdb);
  const mailer = createMailer(config);
  if (!mailer.configured) {
    return NextResponse.json(
      { error: 'SMTP is not configured (no host set, via Console or env).' },
      { status: 400 },
    );
  }

  try {
    await mailer.send({
      to: body.to,
      subject: 'Sovereign SMTP test email',
      text: 'This is a test email from your Sovereign instance — if you received it, your SMTP settings are working.',
      html: '<p>This is a test email from your Sovereign instance — if you received it, your SMTP settings are working.</p>',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send test email';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
