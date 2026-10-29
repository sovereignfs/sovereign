// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The client keeps the `fetch` it finds when it is made, so the stand-in is in place before it is imported.
const answer = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>();
vi.stubGlobal('fetch', (input: unknown, init?: unknown) => answer(input, init));

const { authClient } = await import('../auth/client');

/** The address an app's callback is requested at: what the browser is sent to after an authorization code is made. */
const CALLBACK = 'https://app.example.com/callback?code=abc&state=xyz';

describe('the browser auth client', () => {
  let navigations: string[];

  beforeEach(() => {
    navigations = [];
    // jsdom does not navigate; record what would have been asked for, by `href` or by `assign`.
    vi.stubGlobal('location', {
      ...window.location,
      assign: (url: string) => navigations.push(url),
      set href(url: string) {
        navigations.push(url);
      },
    });
    answer.mockResolvedValue(
      new Response(JSON.stringify({ redirect: true, url: CALLBACK }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  afterEach(() => {
    answer.mockReset();
  });

  it('does not follow a redirect answer itself, since the forms that asked do', async () => {
    const result = await authClient.signIn.email({ email: 'a@example.test', password: 'x' });
    // The answer reaches the form untouched, for `continuationUrl`; the form is the only one that navigates.
    expect(result.data).toMatchObject({ redirect: true, url: CALLBACK });
    // Navigating here as well asks for the app's callback twice with one authorization code, and the second fails.
    expect(navigations).toEqual([]);
  });
});
