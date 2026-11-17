import { describe, expect, it } from 'vitest';
import { toBase64Url } from '../bytes.js';
import { generateReceivingKey, publicKeyBytes } from '../hpke.js';
import {
  isReleaseState,
  newReleaseState,
  openRelease,
  ReleaseError,
  sealRelease,
  type ReleaseAnswer,
} from '../release.js';

const NOW = 1_800_000_000_000;
const target = {
  clientId: 'notes',
  returnTo: 'https://notes.example/keys',
  state: newReleaseState(),
};
const appKey = new Uint8Array(32).fill(4);

async function signer() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return {
    privateKey: pair.privateKey,
    publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
  };
}

/** A page's request, and core's answer to it. */
async function released(overrides: { sub?: string; now?: number; target?: typeof target } = {}) {
  const page = await generateReceivingKey();
  const account = await signer();
  const answer = await sealRelease({
    target: overrides.target ?? target,
    request: toBase64Url(await publicKeyBytes(page.publicKey)),
    appKey,
    sub: overrides.sub ?? 'ada',
    signingKey: account.privateKey,
    signingPublic: account.publicKey,
    now: overrides.now ?? NOW,
  });
  return { page, account, answer };
}

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ReleaseError ? error.reason : `other: ${String(error)}`;
  }
  return 'accepted';
};

describe('key release (RFC 0005 §4)', () => {
  it('gives the asking page the app key, and the signing key to remember', async () => {
    const { page, account, answer } = await released();
    const opened = await openRelease({ answer, target, recipient: page, sub: 'ada', now: NOW });
    expect(opened.appKey).toEqual(appKey);
    expect(opened.signingPublic).toBe(account.publicKey);
    // Once remembered, the same key is accepted.
    const again = await openRelease({
      answer,
      target,
      recipient: page,
      sub: 'ada',
      signingPublic: account.publicKey,
      now: NOW,
    });
    expect(again.appKey).toEqual(appKey);
  });

  it('opens for no other page: sealed to the key of the page that asked', async () => {
    const { answer } = await released();
    const other = await generateReceivingKey();
    expect(
      await refusal(openRelease({ answer, target, recipient: other, sub: 'ada', now: NOW })),
    ).toBe('unopenable');
  });

  it('opens for no other app, return address or state', async () => {
    const { page, answer } = await released();
    for (const changed of [
      { ...target, clientId: 'mail' },
      { ...target, returnTo: 'https://evil.example/keys' },
      { ...target, state: newReleaseState() },
    ]) {
      expect(
        await refusal(
          openRelease({ answer, target: changed, recipient: page, sub: 'ada', now: NOW }),
        ),
      ).toBe('unopenable');
    }
  });

  it('refuses an answer for another person', async () => {
    const { page, answer } = await released({ sub: 'grace' });
    expect(
      await refusal(openRelease({ answer, target, recipient: page, sub: 'ada', now: NOW })),
    ).toBe('other-person');
  });

  it('refuses an answer older than two minutes, or from the future', async () => {
    const { page, answer } = await released();
    const at = (now: number) => openRelease({ answer, target, recipient: page, sub: 'ada', now });
    expect(await refusal(at(NOW + 2 * 60 * 1000))).toBe('accepted');
    expect(await refusal(at(NOW + 2 * 60 * 1000 + 1))).toBe('too-old');
    expect(await refusal(at(NOW - 2 * 60 * 1000 - 1))).toBe('too-old');
  });

  it('refuses an answer signed by a key other than the one remembered', async () => {
    const { page, answer } = await released();
    const stranger = await signer();
    expect(
      await refusal(
        openRelease({
          answer,
          target,
          recipient: page,
          sub: 'ada',
          signingPublic: stranger.publicKey,
          now: NOW,
        }),
      ),
    ).toBe('signature');
  });

  it('refuses an answer whose signature or ciphertext was changed', async () => {
    const { page, answer } = await released();
    const flip = (text: string) => {
      const middle = Math.floor(text.length / 2);
      return text.slice(0, middle) + (text[middle] === 'A' ? 'B' : 'A') + text.slice(middle + 1);
    };
    const badSig: ReleaseAnswer = { ...answer, sig: flip(answer.sig) };
    expect(
      await refusal(openRelease({ answer: badSig, target, recipient: page, sub: 'ada', now: NOW })),
    ).toBe('signature');
    const [enc, ciphertext] = answer.key.split('.') as [string, string];
    const badKey: ReleaseAnswer = { ...answer, key: `${enc}.${flip(ciphertext)}` };
    expect(
      await refusal(openRelease({ answer: badKey, target, recipient: page, sub: 'ada', now: NOW })),
    ).toBe('unopenable');
    for (const key of ['', 'one', `${enc}.${ciphertext}.more`]) {
      expect(
        await refusal(
          openRelease({
            answer: { ...answer, key },
            target,
            recipient: page,
            sub: 'ada',
            now: NOW,
          }),
        ),
      ).toBe('malformed');
    }
  });

  it('makes states of 16 random bytes and knows them', () => {
    const a = newReleaseState();
    expect(isReleaseState(a)).toBe(true);
    expect(a).not.toBe(newReleaseState());
    expect(isReleaseState('short')).toBe(false);
    expect(isReleaseState(undefined)).toBe(false);
  });
});
