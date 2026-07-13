import { headers } from 'next/headers';
import { NotAuthenticatedError } from './errors';
import { requireHost } from './host';
import type {
  CreateE2eeProfileInput,
  E2eeContext,
  E2eeDeviceEnrollment,
  E2eeProfile,
  E2eeRecoveryWrapper,
  EnrollE2eeDeviceInput,
  SetE2eeRecoveryWrapperInput,
} from './types';

const DEFAULT_TENANT_ID = 'default';

async function e2eeContext(): Promise<E2eeContext> {
  const h = await headers();
  const userId = h.get('x-sovereign-user-id');
  if (!userId) throw new NotAuthenticatedError();
  return { tenantId: DEFAULT_TENANT_ID, userId };
}

/**
 * Client-side encryption profile persistence (RFC 0060). Server-side plumbing
 * only — the CMK is generated and wrapped/unwrapped in the browser
 * (`@sovereignfs/sdk/e2ee-crypto`, `@sovereignfs/sdk/e2ee-device`) before any
 * of these methods are called; the server only ever stores/returns opaque
 * ciphertext and non-sensitive KDF/algorithm metadata.
 */
export const e2ee = {
  async getProfile(): Promise<E2eeProfile | null> {
    const context = await e2eeContext();
    return requireHost().e2ee.getProfile(context);
  },

  async createProfile(input: CreateE2eeProfileInput): Promise<E2eeProfile> {
    const context = await e2eeContext();
    return requireHost().e2ee.createProfile(input, context);
  },

  async getRecoveryWrapper(): Promise<E2eeRecoveryWrapper | null> {
    const context = await e2eeContext();
    return requireHost().e2ee.getRecoveryWrapper(context);
  },

  async setRecoveryWrapper(input: SetE2eeRecoveryWrapperInput): Promise<E2eeRecoveryWrapper> {
    const context = await e2eeContext();
    return requireHost().e2ee.setRecoveryWrapper(input, context);
  },

  async enrollDevice(input: EnrollE2eeDeviceInput): Promise<E2eeDeviceEnrollment> {
    const context = await e2eeContext();
    return requireHost().e2ee.enrollDevice(input, context);
  },

  async listDevices(): Promise<E2eeDeviceEnrollment[]> {
    const context = await e2eeContext();
    return requireHost().e2ee.listDevices(context);
  },

  async revokeDevice(id: string): Promise<void> {
    const context = await e2eeContext();
    return requireHost().e2ee.revokeDevice(id, context);
  },
};
