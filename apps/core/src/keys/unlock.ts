/**
 * Setting up and unlocking a person's keys in core's pages (core-app §5.3, §5.4): `@sovereignfs/crypto`'s routine, shared with the
 * apps that run with no core and keep a vault of their own (sdk §9.5). Core's pages pass in its server actions.
 */
export {
  addPasskeyWayIn,
  coverEscrowNow,
  escrowPending,
  finishNewPassword,
  keptAccountKey,
  prepareNewPassword,
  unlockWithKit,
  unlockWithPasskey,
  unlockWithPassword,
  type PreparedChange,
  type Unlocked,
  type VaultActions,
} from '@sovereignfs/crypto/web';
