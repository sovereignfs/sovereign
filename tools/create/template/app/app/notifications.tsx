'use client';

import { useState, useTransition } from 'react';
import { usePush } from '@sovereignfs/pwa/client';
import { Button, PushControl } from './ui';
import { sendTestNotification } from './push-actions';

/** Notifications on this device (@sovereignfs/pwa's usePush and @sovereignfs/ui's PushControl), and a test to see them arrive. */
export function Notifications() {
  const push = usePush();
  const [sending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <PushControl
      appName="__TITLE__"
      state={push.state}
      working={push.working}
      error={push.error}
      onTurnOn={() => void push.turnOn()}
      onTurnOff={() => void push.turnOff()}
    >
      {push.state === 'on' ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={sending}
            onClick={() =>
              start(async () => {
                setResult((await sendTestNotification()).message);
              })
            }
          >
            {sending ? 'Sending…' : 'Send me a test notification'}
          </Button>
          {result ? <span role="status">{result}</span> : null}
        </>
      ) : null}
    </PushControl>
  );
}
