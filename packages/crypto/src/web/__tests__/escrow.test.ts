import { describe, expect, it } from 'vitest';
import { formatEscrowKey, looksLikeEscrowKey, parseEscrowKey } from '../escrow.js';
import { generateReceivingKey, publicKeyBytes } from '../hpke.js';
import { newKey } from '../records.js';
import { openEscrowWrap, sealEscrowWrap } from '../sharing.js';

describe('the escrow key line (core-app §5.8)', () => {
  it('reads back what it writes, and a wrap sealed to it opens with the private half', async () => {
    const pair = await generateReceivingKey();
    const publicKey = await publicKeyBytes(pair.publicKey);
    const line = await formatEscrowKey(publicKey);
    expect(looksLikeEscrowKey(line)).toBe(true);
    const parsed = await parseEscrowKey(` ${line}\n`);
    expect(parsed?.publicKey).toEqual(publicKey);

    const accountKey = newKey();
    const record = await sealEscrowWrap({
      accountKey,
      sub: 'ada',
      escrowKeyId: parsed?.id ?? '',
      escrowPublicKey: publicKey,
    });
    expect(
      await openEscrowWrap({
        record,
        sub: 'ada',
        escrowKeyId: parsed?.id ?? '',
        escrow: { privateKey: pair.privateKey, publicKey },
      }),
    ).toEqual(accountKey);
  });

  it('refuses a line whose id does not match its key, or that is not one', async () => {
    const one = await formatEscrowKey(
      await publicKeyBytes((await generateReceivingKey()).publicKey),
    );
    const two = await formatEscrowKey(
      await publicKeyBytes((await generateReceivingKey()).publicKey),
    );
    const [, idOne] = one.split('.');
    const [, , keyTwo] = two.split('.');
    expect(await parseEscrowKey(`sv-escrow-1.${idOne}.${keyTwo}`)).toBeUndefined();
    expect(await parseEscrowKey('age1something')).toBeUndefined();
    expect(looksLikeEscrowKey('sv-escrow-1.short.key')).toBe(false);
  });
});
