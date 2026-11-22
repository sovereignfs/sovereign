'use client';

import { appKeys } from '@sovereignfs/sdk/keys';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card } from '../../ui';

/** Where this app's server gives the session's key secret (`@sovereignfs/auth`, auth.md §8.1). */
const KEY_SECRET = '/api/auth/sv/key-secret';

/** Takes core's answer from the address, checks it and keeps the key (sdk §9.3), then goes back to where the person was. */
export function Received(props: { core: string; clientId: string; returnTo: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const keys = appKeys({ ...props, secretPath: KEY_SECRET });
    keys
      .receive()
      .then((received) => (received.ok ? router.replace(received.returnPath) : setFailed(true)))
      .catch(() => setFailed(true));
    // Once, when the page loads: the answer is in the address only until it is read.
  }, []);

  if (!failed)
    return (
      <Card>
        <h1>Unlocking…</h1>
        <p>Taking you back to where you were.</p>
      </Card>
    );
  return (
    <Alert variant="error" heading="Couldn’t unlock">
      <p>Try again.</p>
      <Button onClick={() => void appKeys({ ...props, secretPath: KEY_SECRET }).unlock('/')}>
        Try again
      </Button>{' '}
      <a href="/">Back to your notes</a>
    </Alert>
  );
}
