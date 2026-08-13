import { NextResponse } from 'next/server';
import { engineKind } from '../../../src/config';
import { ensureModelDownload, getModelStatus } from '../../../src/model';

/**
 * Liveness probe, unauthenticated — same as apps/auth/apps/relay's. This
 * service holds no user data, so no sensitivity concern in leaving it
 * reachable within the internal network (it's still never exposed to the
 * public internet — see docker-compose.yml's `harness` profile, no `ports:`
 * mapping at all).
 *
 * Also surfaces `modelStatus` (RFC 0063 §6's "Model missing on the engine
 * → clear message" failure mode) — reading this endpoint is how a caller
 * (Warden, leg 3) distinguishes "engine unreachable" from "engine up but
 * model still downloading" from "genuinely ready."
 *
 * The fake engine (SOVEREIGN_HARNESS_ENGINE=fake, CI/tests only) never
 * needs a real model file, so it reports `ready` unconditionally rather
 * than kicking off a download that would never resolve in a fake-engine
 * environment.
 */
export function GET(): Response {
  if (engineKind() === 'fake') {
    return NextResponse.json({ status: 'ok', modelStatus: 'ready', modelError: null });
  }

  ensureModelDownload();
  const { status, error } = getModelStatus();
  return NextResponse.json({ status: 'ok', modelStatus: status, modelError: error });
}
