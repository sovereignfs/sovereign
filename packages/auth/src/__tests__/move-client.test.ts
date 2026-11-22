import { describe, expect, it, vi } from 'vitest';
import { signInWithPassword, type PasswordMove } from '../client/index';

/**
 * The sign-in page's side of moving a password stored before the package (auth.md §8.1): only while one can still move, and only after
 * an answer that is a wrong password, it sends what it used to send with the sign-in value once, and signs in again.
 */
const derive = async (password: string) => ({
  signIn: `svp1.${Buffer.from(password.padEnd(32, '.')).subarray(0, 32).toString('base64url')}`,
  secret: {} as never,
});

function clientAnswering(
  ...answers: { error?: { status: number; code?: string } | null; data?: unknown }[]
) {
  const email = vi.fn(async () => answers.shift() ?? { data: {} });
  return { client: { signIn: { email } }, email };
}

function moveThat(
  moving: boolean,
  previous: (password: string, email: string) => Promise<string> = async (password) => password,
) {
  const send = vi.fn(async () => undefined);
  const move: PasswordMove = { moving: async () => moving, previous, send };
  return { move, send };
}

const wrong = { error: { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' } };

describe('moving a password at sign-in', () => {
  it('sends what was sent before and the sign-in value once, after a wrong password, then signs in again', async () => {
    const { client, email } = clientAnswering(wrong, { data: { token: 't' } });
    const { move, send } = moveThat(true);
    const result = await signInWithPassword(
      client as never,
      derive,
      { email: 'ada@example.com', password: 'pw' },
      undefined,
      move,
    );
    expect(result.outcome).toBe('signed-in');
    expect(send).toHaveBeenCalledOnce();
    const [body] = send.mock.calls[0] as unknown as [
      { email: string; previous: string; signIn: string },
    ];
    expect(body.email).toBe('ada@example.com');
    expect(body.previous).toBe('pw');
    expect(body.signIn).toMatch(/^svp1\./);
    // Both sign-ins send the sign-in value, never the password.
    for (const [input] of email.mock.calls as unknown as [{ password: string }][])
      expect(input.password).toBe(body.signIn);
  });

  it('sends what the app sent before where it derived a value of its own, and never the password then', async () => {
    const { client } = clientAnswering(wrong, { data: {} });
    const { move, send } = moveThat(
      true,
      async (password, address) => `tally:${address}:${password.length}`,
    );
    await signInWithPassword(
      client as never,
      derive,
      { email: 'ada@example.com', password: 'pw' },
      undefined,
      move,
    );
    expect((send.mock.calls[0] as unknown as [{ previous: string }])[0].previous).toBe(
      'tally:ada@example.com:2',
    );
  });

  it('sends nothing while no password can move, after a right password, or after a refusal that is not a wrong password', async () => {
    for (const [answers, moving] of [
      [[wrong], false],
      [[{ data: {} }], true],
      [[{ error: { status: 429 } }], true],
      [[{ error: { status: 403, code: 'ACCOUNT_DEACTIVATED' } }], true],
      [[{ error: { status: 403, code: 'EMAIL_NOT_VERIFIED' } }], true],
    ] as const) {
      const { client } = clientAnswering(...(answers as unknown as never[]));
      const { move, send } = moveThat(moving);
      await signInWithPassword(
        client as never,
        derive,
        { email: 'ada@example.com', password: 'pw' },
        undefined,
        move,
      );
      expect(send).not.toHaveBeenCalled();
    }
  });

  it('says the email or password is incorrect when the move did not help', async () => {
    const { client } = clientAnswering(wrong, wrong);
    const { move } = moveThat(true);
    const result = await signInWithPassword(
      client as never,
      derive,
      { email: 'ada@example.com', password: 'pw' },
      undefined,
      move,
    );
    expect(result).toEqual({ outcome: 'refused', message: 'The email or password is incorrect.' });
  });
});
