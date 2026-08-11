import { StatusBadge } from '@sovereignfs/ui';
import styles from '../console.module.css';

/**
 * Read-only field-encryption status (RFC 0092, epic task 8.34). Deliberately
 * not editable: the policy lives in environment configuration
 * (`SOVEREIGN_ENCRYPT_CLASSES` / `SOVEREIGN_FIELD_KEK`) because changing it
 * has data-migration implications the `sv db encrypt-fields` runbook owns —
 * a Console toggle would invite exactly the casual flip the RFC 0071
 * incident taught us to avoid. Server component; data arrives from
 * `/api/admin/settings`.
 */

export interface FieldEncryptionView {
  enabledClasses: string[];
  kekConfigured: boolean;
  openRotations: { pluginId: string; class: string; openedDaysAgo: number }[];
  registrations: { pluginId: string; tableCount: number }[];
}

export function FieldEncryptionStatus({ view }: { view: FieldEncryptionView }) {
  const off = view.enabledClasses.length === 0;

  return (
    <div>
      {off ? (
        <p className={styles.helpText}>
          Field encryption is off — no sensitivity classes are enabled. To turn it on, set{' '}
          <code className={styles.codeInline}>SOVEREIGN_ENCRYPT_CLASSES</code> and{' '}
          <code className={styles.codeInline}>SOVEREIGN_FIELD_KEK</code> in your deployment
          configuration, then run the backfill. See the self-hosting guide.
        </p>
      ) : (
        <>
          <p className={styles.helpText}>
            Encrypting new writes for:{' '}
            {view.enabledClasses.map((cls) => (
              <code key={cls} className={styles.codeInline}>
                {cls}
              </code>
            ))}{' '}
            — key {view.kekConfigured ? 'configured' : 'MISSING'}. Existing data is only converted
            by <code className={styles.codeInline}>sv db encrypt-fields</code>, never automatically.
          </p>

          {view.openRotations.length > 0 && (
            <div className={styles.helpText}>
              <StatusBadge status="warning">
                {view.openRotations.length === 1
                  ? '1 key rotation in progress'
                  : `${view.openRotations.length} key rotations in progress`}
              </StatusBadge>
              <ul>
                {view.openRotations.map((rotation) => (
                  <li key={`${rotation.pluginId}:${rotation.class}`}>
                    <code className={styles.codeInline}>{rotation.pluginId}</code> /{' '}
                    {rotation.class} — open for {rotation.openedDaysAgo}{' '}
                    {rotation.openedDaysAgo === 1 ? 'day' : 'days'}. Finish with{' '}
                    <code className={styles.codeInline}>
                      sv keys rotate-blind-index --plugin {rotation.pluginId}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.helpText}>
            {view.registrations.length === 0
              ? 'No apps have registered encrypted tables yet — the backfill and rotation tools ' +
                'only cover tables apps register.'
              : `Registered encrypted tables: ${view.registrations
                  .map((r) => `${r.pluginId} (${String(r.tableCount)})`)
                  .join(', ')}.`}
          </p>
        </>
      )}
    </div>
  );
}
