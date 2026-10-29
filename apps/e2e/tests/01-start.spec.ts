import { expect, test } from '@playwright/test';
import { CORE_URL } from '../support/env';

test('§3.17.1: a fresh instance has started from the documented variables, and reports itself and its database up', async ({
  request,
}) => {
  const reply = await request.get(`${CORE_URL}/api/health`);
  expect(reply.status()).toBe(200);
  expect(await reply.json()).toEqual({ status: 'ok', app: 'up', database: 'up' });
});
