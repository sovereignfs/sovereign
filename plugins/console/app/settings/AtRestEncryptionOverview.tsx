import styles from '../console.module.css';

/**
 * The general at-rest encryption picture (GDPR-9, workstream 0021 leg 7) —
 * what `FieldEncryptionStatus` below this doesn't say on its own: field
 * encryption is one narrow, opt-in layer, not the whole story. Deliberately
 * states only what the app can actually verify (its own field-encryption
 * config, a real count of enrolled zero-knowledge profiles) plus a plain
 * factual statement that nothing else is encrypted by the platform by
 * default — never a claim about host-disk encryption state, which this
 * process has no way to observe from inside its own container.
 */

export interface AtRestEncryptionView {
  /** Real count of `e2ee_profiles` rows — not a manifest permission check; see the API route's own comment for why. */
  e2eeProfileCount: number;
}

export function AtRestEncryptionOverview({ view }: { view: AtRestEncryptionView }) {
  return (
    <div>
      <p className={styles.helpText}>
        Nothing on this instance is encrypted at rest by the platform itself, by default, on either
        database dialect. Two narrower layers exist on top of that: field encryption (below —
        opt-in, per sensitivity class) and zero-knowledge client-side encryption (per-user, opt-in).
        Everything else — most app data — depends entirely on you, the operator, encrypting the
        underlying disk. See the self-hosting guide&apos;s &quot;Disk-level encryption&quot;
        section.
      </p>
      <p className={styles.helpText}>
        {view.e2eeProfileCount === 0
          ? 'No users on this instance have enrolled zero-knowledge client-side encryption yet.'
          : `${view.e2eeProfileCount} ${view.e2eeProfileCount === 1 ? 'user has' : 'users have'} enrolled zero-knowledge client-side encryption. Data an enrolled profile covers can't be read by this instance's database, its operator, or Sovereign, the open-source project.`}
      </p>
    </div>
  );
}
