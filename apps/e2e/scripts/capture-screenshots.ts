/**
 * Makes the pictures core's install sheet shows (RFC 0001 A1): starts the built core on a database of its own,
 * photographs its sign-in page with the default branding at the sizes the manifest names, and writes them into
 * `apps/core/src/branding/screenshots.ts`. Build core first, then:
 *
 *   SV_DB_DIALECT=sqlite SV_SQLITE_URL=file:/tmp/sv-shots.db pnpm --filter @sovereignfs/e2e exec tsx scripts/capture-screenshots.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { coreEnvironment, createTestDatabase, startCore, waitForHealth } from '../support/core';
import { CORE_URL } from '../support/env';

const TARGET = new URL('../../core/src/branding/screenshots.ts', import.meta.url);
const SHOTS = [
  { name: 'NARROW', width: 540, height: 1170 },
  { name: 'WIDE', width: 1280, height: 800 },
] as const;

const database = await createTestDatabase();
const core = await startCore(coreEnvironment(database));
try {
  await waitForHealth(core);
  const browser = await chromium.launch();
  let source = readFileSync(TARGET, 'utf8');
  for (const shot of SHOTS) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      colorScheme: 'light',
    });
    await page.goto(`${CORE_URL}/sign-in`);
    await page.waitForLoadState('networkidle');
    const png = await page.screenshot({ type: 'png' });
    source = source.replace(
      new RegExp(`const ${shot.name} =[^;]*;`),
      `const ${shot.name} =\n  '${png.toString('base64')}';`,
    );
    await page.close();
  }
  await browser.close();
  writeFileSync(TARGET, source);
} finally {
  await core.stop();
  await database.cleanup();
}
