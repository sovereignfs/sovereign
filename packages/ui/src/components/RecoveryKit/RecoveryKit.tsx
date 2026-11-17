'use client';

import { useState } from 'react';
import { Button } from '../Button/Button';
import { Checkbox } from '../Checkbox/Checkbox';
import styles from './RecoveryKit.module.css';

export interface RecoveryKitProps {
  /** The kit as `@sovereignfs/crypto/web`'s `formatKit` writes it: fourteen groups of four, joined by hyphens. */
  kit: string;
  /** The instance's name, for the saved file's name and first line. */
  instanceName: string;
  /** Called when the person has said they kept it and presses Continue. */
  onContinue: () => void;
  /** True while what Continue started is running: the button says so and cannot be pressed again. */
  continuing?: boolean;
  /**
   * True when the instance's owner turned on recovery (escrow, core-app §5.8): the kit is then the person's own way back, and not the
   * only one. Leave it off otherwise; the kit then says that nobody else can get the data back.
   */
  ownerCanRecover?: boolean;
  className?: string;
}

/** The saved file's name: the instance's name in lower case, letters and digits joined by hyphens. */
export function recoveryKitFileName(instanceName: string): string {
  const slug = instanceName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
  return `${slug || 'sovereign'}-recovery-kit.txt`;
}

/** What the saved file holds. */
export function recoveryKitFileText(
  kit: string,
  instanceName: string,
  ownerCanRecover = false,
): string {
  return [
    `Recovery kit for ${instanceName}`,
    '',
    kit,
    '',
    ownerCanRecover
      ? `Keep this somewhere safe. If you forget your password and have no passkey, it is your own way back to your encrypted data. The owner of ${instanceName} can also recover it.`
      : 'Keep this somewhere safe. If you forget your password and have no passkey, it is the only way back to your encrypted data.',
    '',
  ].join('\n');
}

/**
 * RecoveryKit — the recovery kit, shown once when an account is set up (core-app §5.3), with Print and Save as a file, and
 * Continue held off until the person says they kept it. It shows the text it is given and never sees the bytes behind it.
 * The file is made only when Save is pressed, never in render. When the page is printed, only the kit is printed.
 */
export function RecoveryKit({
  kit,
  instanceName,
  onContinue,
  continuing = false,
  ownerCanRecover = false,
  className,
}: RecoveryKitProps) {
  const [kept, setKept] = useState(false);
  const groups = kit.split(/[\s-]+/).filter(Boolean);

  const save = () => {
    const url = URL.createObjectURL(
      new Blob([recoveryKitFileText(kit, instanceName, ownerCanRecover)], {
        type: 'text/plain;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = recoveryKitFileName(instanceName);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className={[styles.root, className].filter(Boolean).join(' ')}
      aria-labelledby="recovery-kit-heading"
    >
      <h2 id="recovery-kit-heading" className={styles.heading}>
        Save your recovery kit
      </h2>
      {ownerCanRecover ? (
        <p className={styles.explain}>
          If you forget your password and have no passkey, this kit is your own way back to your
          encrypted data. The owner of {instanceName} has turned on recovery, so they can also
          recover it for you.
        </p>
      ) : (
        <p className={styles.explain}>
          If you forget your password and have no passkey, this kit is the only way back to your
          encrypted data. Nobody else can get it back for you, not even this service&rsquo;s
          operators.
        </p>
      )}
      <div className={styles.printable}>
        <p className={styles.printTitle}>Recovery kit for {instanceName}</p>
        <ol className={styles.groups} aria-label="Your recovery kit, in groups of four">
          {groups.map((group, index) => (
            <li
              key={index}
              className={[styles.group, index === groups.length - 1 ? styles.check : '']
                .filter(Boolean)
                .join(' ')}
              aria-label={[...group].join(' ')}
            >
              {group}
            </li>
          ))}
        </ol>
        <p className={styles.note}>The last group checks the others for typos.</p>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="secondary" onClick={save}>
          Save as a file
        </Button>
      </div>
      <Checkbox
        id="recovery-kit-kept"
        checked={kept}
        onChange={setKept}
        label="I've kept my recovery kit somewhere safe"
      />
      <Button
        className={styles.continue}
        disabled={!kept}
        loading={continuing}
        onClick={onContinue}
      >
        {continuing ? 'Continuing…' : 'Continue'}
      </Button>
    </section>
  );
}
