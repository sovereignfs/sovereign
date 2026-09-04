import { NextResponse } from 'next/server';
import { getPlatformSetting, setPlatformSetting } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { deliverCommunicationEmail, escapeHtml } from '@/src/communication-email';
import { getPlatformDb } from '@/src/db';
import { deliverNotification } from '@/src/notification-delivery';
import { fetchDirectoryUsers } from '@/src/sdk-host';

/** Minimum seconds between admin broadcasts (rate-limit guard). */
const BROADCAST_COOLDOWN_SECS = 60;

/**
 * POST /api/admin/broadcast — programmatic broadcast via API key.
 *
 * The Console UI uses POST /api/account/broadcast (session-gated) instead —
 * /api/admin/* is excluded from the session middleware so role headers are
 * not injected here. This endpoint exists for scripted/CI callers with
 * Authorization: Bearer <SOVEREIGN_ADMIN_KEY>.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    recipientUserIds: string[];
    title: string;
    body?: string;
    url?: string;
    category?: string;
    /** Also send email to recipients who have opted into communication email (RFC 0062 §6). Off by default. */
    sendEmail?: boolean;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!Array.isArray(body.recipientUserIds) || body.recipientUserIds.length === 0) {
    return NextResponse.json(
      { error: 'recipientUserIds must be a non-empty array' },
      { status: 400 },
    );
  }
  if (body.recipientUserIds.length > 1000) {
    return NextResponse.json(
      { error: 'recipientUserIds may not exceed 1000 per broadcast' },
      { status: 400 },
    );
  }

  const pdb = await getPlatformDb();

  // Rate-limit check.
  const lastBroadcast = await getPlatformSetting(pdb, 'last_broadcast_at');
  if (lastBroadcast) {
    const elapsed = Math.floor(Date.now() / 1000) - Number(lastBroadcast);
    if (elapsed < BROADCAST_COOLDOWN_SECS) {
      return NextResponse.json(
        { error: `rate limited — next broadcast allowed in ${BROADCAST_COOLDOWN_SECS - elapsed}s` },
        { status: 429 },
      );
    }
  }

  await setPlatformSetting(pdb, 'last_broadcast_at', String(Math.floor(Date.now() / 1000)));

  // deliverNotification() (not a raw sendNotification() insert) applies RFC
  // 0048 §6's mute-policy matrix per recipient — see the sibling
  // /api/account/broadcast route's identical fix for the full rationale.
  await Promise.all(
    body.recipientUserIds.map((userId) =>
      deliverNotification(pdb, {
        recipientUserId: userId,
        source: 'admin',
        sourceType: 'admin',
        title: body.title,
        body: body.body,
        url: body.url,
        category: body.category ?? 'announcement',
      }),
    ),
  );

  // Optional communication-class email (RFC 0062 §6) — see the sibling
  // /api/account/broadcast route's identical addition for the full
  // rationale; deliverCommunicationEmail() re-checks each recipient's own
  // communicationEmail opt-in.
  if (body.sendEmail) {
    const recipients = await fetchDirectoryUsers({ mode: 'resolve', ids: body.recipientUserIds });
    const text = body.body ? `${body.title}\n\n${body.body}` : body.title;
    const html = body.body
      ? `<p><strong>${escapeHtml(body.title)}</strong></p><p>${escapeHtml(body.body)}</p>`
      : `<p>${escapeHtml(body.title)}</p>`;
    await Promise.all(
      recipients.map((recipient) =>
        deliverCommunicationEmail(pdb, {
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          subject: body.title,
          text,
          html,
          source: 'console',
          templateId: 'broadcast',
        }),
      ),
    );
  }

  return NextResponse.json({ ok: true, sent: body.recipientUserIds.length });
}
