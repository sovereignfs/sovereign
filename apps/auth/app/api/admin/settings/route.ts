import { NextResponse } from 'next/server';
import { checkAdminKey } from '@/src/admin-guard';
import { getEnv } from '@/src/env';
import {
  readInviteOnlySetting,
  readSmtpSettings,
  resolveInviteOnly,
  writeInviteOnlySetting,
  writeSmtpSettings,
} from '@/src/settings';

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const inviteOnly = resolveInviteOnly(await readInviteOnlySetting(), getEnv().inviteOnly);
  const smtp = await readSmtpSettings();
  return NextResponse.json({
    inviteOnly,
    smtp: { host: smtp.host, port: smtp.port, user: smtp.user, from: smtp.from },
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    inviteOnly?: boolean;
    smtp?: { host?: string; port?: number; user?: string; pass?: string; from?: string };
  };

  if (body.inviteOnly !== undefined) {
    if (typeof body.inviteOnly !== 'boolean') {
      return NextResponse.json({ error: 'inviteOnly must be a boolean' }, { status: 400 });
    }
    await writeInviteOnlySetting(body.inviteOnly);
  }

  if (body.smtp !== undefined) {
    await writeSmtpSettings(body.smtp);
  }

  return NextResponse.json({ ok: true });
}
