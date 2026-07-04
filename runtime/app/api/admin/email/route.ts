import { NextResponse } from 'next/server';
import type { EmailDeliveryClass } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { sendPlatformEmail, type PlatformEmailSource } from '@/src/platform-email';

interface AdminEmailRequest {
  templateId?: string;
  deliveryClass?: EmailDeliveryClass;
  toUserId?: string | null;
  toEmail?: string;
  actorUserId?: string | null;
  source?: PlatformEmailSource;
  subject?: string;
  html?: string;
  text?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as AdminEmailRequest | null;
  if (!body?.templateId || !body.deliveryClass || !body.toEmail || !body.subject) {
    return NextResponse.json(
      { error: 'templateId, deliveryClass, toEmail, and subject required' },
      { status: 400 },
    );
  }

  const result = await sendPlatformEmail({
    templateId: body.templateId,
    deliveryClass: body.deliveryClass,
    toUserId: body.toUserId ?? null,
    toEmail: body.toEmail,
    actorUserId: body.actorUserId ?? null,
    source: body.source ?? 'console',
    subject: body.subject,
    html: body.html,
    text: body.text,
    metadata: body.metadata,
  });

  return NextResponse.json(result, { status: result.status === 'failed' ? 502 : 200 });
}
