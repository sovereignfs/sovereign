'use client';

import { QrCode, TwoFactorPanel as Panel } from '@sovereignfs/ui';
import { twoFactorSettings } from '@sovereignfs/auth/client';
import { encode } from 'uqr';
import { authClient } from '../../../src/auth/client';
import { signInValue } from '../../../src/auth/derive';

const reload = () => window.location.reload();

/**
 * Turning two-factor sign-in on and off, and its backup codes: the design system's panel and the sign-in package's flow, with core's
 * QR encoder. The page reloads after a change, so what it shows is what the server holds.
 */
export function TwoFactorPanel({
  enabled,
  issuer,
  verified,
  address,
}: {
  enabled: boolean;
  issuer: string;
  verified: boolean;
  /** The account's address, which the password's sign-in value is made from (core-app §5.2). */
  address: string;
}) {
  const { start, confirm } = twoFactorSettings(authClient, signInValue, { address, issuer });
  return (
    <Panel
      enabled={enabled}
      verified={verified}
      start={start}
      confirm={confirm}
      renderQr={(uri) => (
        <QrCode
          modules={encode(uri, { ecc: 'M', border: 0 }).data}
          label="QR code for your authenticator app"
        />
      )}
      onDone={reload}
    />
  );
}
