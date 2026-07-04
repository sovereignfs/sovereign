import { NextResponse } from 'next/server';
import { sendPlatformEmail } from '@/src/platform-email';

interface AccountEmailRequest {
  templateId?: string;
  subject?: string;
  html?: string;
  text?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  const userEmail = request.headers.get('x-sovereign-user-email');
  if (!userId || !userEmail) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AccountEmailRequest | null;
  if (!body?.templateId || !body.subject) {
    return NextResponse.json({ error: 'templateId and subject required' }, { status: 400 });
  }

  const result = await sendPlatformEmail({
    templateId: body.templateId,
    deliveryClass: 'security',
    toUserId: userId,
    toEmail: userEmail,
    actorUserId: userId,
    source: 'account',
    subject: body.subject,
    html: body.html,
    text: body.text,
    metadata: body.metadata,
  });

  return NextResponse.json(result, { status: result.status === 'failed' ? 502 : 200 });
}
