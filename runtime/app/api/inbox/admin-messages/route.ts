import { NextResponse } from 'next/server';
import { logActivity } from '@/src/activity';
import { hasCapability } from '@/src/capabilities';
import { getPlatformDb } from '@/src/db';
import { fetchDirectoryUsers } from '@/src/sdk-host';
import { sendAdminMessage } from '@/src/messages';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

interface MemberRow {
  id: string | null;
  status: 'active' | 'deactivated' | 'invited';
}

async function fetchAllActiveUserIds(): Promise<string[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${AUTH_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const members = (await res.json()) as MemberRow[];
  return members.filter((m) => m.status === 'active' && m.id).map((m) => m.id as string);
}

/**
 * POST /api/inbox/admin-messages — Console's admin message compose (RFC
 * 0048 §5/§7). Session-gated; requires `console:access` (mirrors
 * `/api/account/broadcast`'s own gate). Unlike the two broadcast routes,
 * this one calls `logActivity()` — RFC 0048 §7's explicit "admin messages
 * are audited" requirement; broadcast's own pre-existing missing-audit gap
 * is unrelated and intentionally left alone (see the leg's plan file).
 */
export async function POST(request: Request): Promise<Response> {
  const role = request.headers.get('x-sovereign-user-role');
  const actorUserId = request.headers.get('x-sovereign-user-id');
  if (!role || !hasCapability(role, 'console:access') || !actorUserId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await request.json()) as {
    subject: string;
    body: string;
    notify?: boolean;
    recipientUserIds?: string[];
    allActiveUsers?: boolean;
    /** Also send email to recipients who have opted into communication email (RFC 0062 §6). Off by default. */
    sendEmail?: boolean;
  };

  if (!body.subject?.trim()) {
    return NextResponse.json({ error: 'subject is required' }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }

  let recipientUserIds: string[];
  if (body.allActiveUsers) {
    recipientUserIds = await fetchAllActiveUserIds();
    if (recipientUserIds.length === 0) {
      return NextResponse.json({ error: 'no active users found' }, { status: 400 });
    }
  } else {
    if (!Array.isArray(body.recipientUserIds) || body.recipientUserIds.length === 0) {
      return NextResponse.json(
        { error: 'recipientUserIds must be a non-empty array, or set allActiveUsers' },
        { status: 400 },
      );
    }
    recipientUserIds = body.recipientUserIds;
  }

  const pdb = await getPlatformDb();
  const subject = body.subject.trim();

  let result;
  try {
    result = await sendAdminMessage(
      pdb,
      {
        recipientUserIds,
        subject,
        body: body.body.trim(),
        notify: body.notify,
        sendEmail: body.sendEmail,
      },
      actorUserId,
      (ids) => fetchDirectoryUsers({ mode: 'resolve', ids }),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to send message' },
      { status: 400 },
    );
  }

  void logActivity({
    actorId: actorUserId,
    actorType: 'user',
    action: 'admin.message_sent',
    targetType: 'message',
    targetId: result.messageId,
    visibility: 'admin',
    summary: `Admin message sent to ${String(result.sentTo.length)} recipient${result.sentTo.length !== 1 ? 's' : ''}`,
    metadata: {
      subject,
      recipientCount: result.sentTo.length,
      skippedCount: result.skipped.length,
    },
  });

  return NextResponse.json({ ok: true, sentTo: result.sentTo, skipped: result.skipped });
}
