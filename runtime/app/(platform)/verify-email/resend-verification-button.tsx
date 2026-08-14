'use client';

import { useState } from 'react';
import { Button } from '@sovereignfs/ui';
import { authClient } from '@/src/auth-client';

/**
 * Resend button for an already-signed-in, still-unverified user (level 0
 * with an active session — reachable when `AUTH_REQUIRE_EMAIL_VERIFICATION`
 * is off but a plugin/route declares `min_verification_level >= 1`, or for a
 * pre-existing account created before this flow shipped). Distinct from the
 * pre-session resend on `apps/auth`'s own login form: that one fires after a
 * blocked *sign-in* attempt for an anonymous visitor; this one is for a
 * visitor who already has a session. Same underlying better-auth call,
 * routed through the runtime's own proxied `authClient` (no baseURL — calls
 * `/api/auth/*` on the runtime's own origin) so it works from here without a
 * cross-origin request to the auth server.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onResend() {
    setSending(true);
    await authClient.sendVerificationEmail({ email });
    setSending(false);
    setSent(true);
  }

  return (
    <Button type="button" onClick={() => void onResend()} disabled={sending}>
      {sending ? 'Sending…' : sent ? 'Sent — resend again' : 'Resend verification email'}
    </Button>
  );
}
