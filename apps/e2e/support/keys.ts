import type { Page } from '@playwright/test';
import { memoryBackend } from '@sovereignfs/crypto/web';
import { appKeys } from '@sovereignfs/sdk/keys';
import { openDatabase } from './database';
import { CORE_URL } from './env';

/**
 * Key release and sharing as an app's page does them (sdk §9.3, §9.4), shared by the specs that need an app key: the page is run
 * through `@sovereignfs/sdk/keys` itself, in the suite's process, and the browser does what a person's would at core.
 */

export async function subOf(email: string): Promise<string> {
  const database = await openDatabase();
  try {
    return String(
      (await database.run('select id from users where email = ?', [email])).rows[0]?.id,
    );
  } finally {
    await database.close();
  }
}

/**
 * An app's page, run here through `@sovereignfs/sdk/keys` itself: its address bar is the browser's, its server's key secret one
 * per app session, and what it keeps is in memory. The browser does what a person's would: core's release page, then the app.
 */
export function appPage(clientId: string, returnTo: string, sub: string) {
  const bar = { hash: '', assigned: '' };
  const secret = Buffer.alloc(32, clientId.length).toString('base64url');
  const keys = appKeys({
    core: CORE_URL,
    clientId,
    returnTo,
    backend: memoryBackend(),
    fetch: async () => new Response(JSON.stringify({ sub, secret }), { status: 200 }),
    location: {
      get hash() {
        return bar.hash;
      },
      pathname: '/',
      search: '',
      assign: (url: string | URL) => {
        bar.assigned = String(url);
      },
    },
    history: {
      replaceState: () => {
        bar.hash = '';
      },
    },
  });
  return { keys, bar };
}

/** Takes the browser through core's release for `app`, and gives the fragment it came back with. */
export async function release(page: Page, app: ReturnType<typeof appPage>, returnTo: string) {
  await app.keys.unlock();
  // As the app's page would: the browser says where the request came from.
  await page.goto(app.bar.assigned, { referer: `${new URL(returnTo).origin}/` });
  const kit = page.getByRole('checkbox', { name: /kept my recovery kit/ });
  const back = page.waitForURL((url) => url.href.startsWith(`${returnTo}#`), { timeout: 15_000 });
  // The first encrypted app shows the kit once (core-app §5.3).
  await Promise.race([
    back,
    kit.waitFor({ timeout: 15_000 }).then(async () => {
      await kit.check();
      await page.getByRole('button', { name: 'Continue' }).click();
    }),
  ]);
  await back;
  return new URL(page.url()).hash;
}

/** A person's keys for an app as the Core API answers them (`getMyKeys`), read from what core keeps. */
export async function myKeysOf(sub: string, clientId: string) {
  const database = await openDatabase();
  try {
    const row = (
      await database.run(
        'select a.identity, a.signature, k.signing_public from key_apps a join key_accounts k on k.user_id = a.user_id where a.user_id = ? and a.client_id = ?',
        [sub, clientId],
      )
    ).rows[0];
    const identity = JSON.parse(String(row?.identity)) as {
      receive: { publicKey: string; privateKey: { suite: 1; nonce: string; ciphertext: string } };
      sign: { publicKey: string; privateKey: { suite: 1; nonce: string; ciphertext: string } };
    };
    return {
      sub,
      receivingKey: identity.receive.publicKey,
      signingKey: identity.sign.publicKey,
      signature: String(row?.signature),
      accountSigningKey: String(row?.signing_public),
      wrapped: { receive: identity.receive.privateKey, sign: identity.sign.privateKey },
    };
  } finally {
    await database.close();
  }
}
