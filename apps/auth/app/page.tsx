import { redirect } from 'next/navigation';
import { runtimePublicUrl } from '@/src/runtime-url';

// Auth server no longer serves most UI (login/2fa/verify-email stay here — see
// oauthProvider.loginPage in src/auth.ts); redirect the bare root to the runtime.
// Must use the browser-facing URL (runtimePublicUrl), not SOVEREIGN_RUNTIME_URL —
// that's the internal Docker service address and unreachable from the browser.
export default function Home() {
  redirect(runtimePublicUrl());
}
