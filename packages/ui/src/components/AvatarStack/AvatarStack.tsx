'use client';

import { Avatar, type AvatarProps } from '../Avatar/Avatar';
import styles from './AvatarStack.module.css';

export interface AvatarStackPerson {
  name: string;
  src?: string;
}

export interface AvatarStackProps {
  /** Everyone in the stack, in the order they should appear. */
  people: readonly AvatarStackPerson[];
  /** How many avatars are drawn before the rest become a "+N" count. Default 4. */
  max?: number;
  size?: NonNullable<AvatarProps['size']>;
  /** What the whole stack is, said before the names ("Going", "Members"). Optional. */
  label?: string;
  className?: string;
}

/** "Ada", "Ada and Grace", "Ada, Grace and Sam": every name, so that nobody is only a number to a screen reader. */
function namesOf(people: readonly AvatarStackPerson[]): string {
  const names = people.map((person) => person.name.trim()).filter((name) => name !== '');
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Overlapping avatars with a "+N" count beyond a limit, for who is in something (a trip's members, the people on a split). The stack is **one image to assistive technology**, labelled
 * with every name, so the drawn avatars and the count are hidden from it: a screen reader says "Ada, Grace and Sam", not "AL, GH, +1".
 */
export function AvatarStack({ people, max = 4, size = 'md', label, className }: AvatarStackProps) {
  if (people.length === 0) return null;
  const limit = Math.max(1, Math.floor(max));
  // A count that replaces one avatar is no saving: with exactly one more than the limit, show them all.
  const hidden = people.length > limit + 1 ? people.length - limit : 0;
  const shown = hidden > 0 ? people.slice(0, limit) : people;
  const names = namesOf(people);
  const accessible = label ? `${label}: ${names}` : names;
  const cls = [styles.stack, styles[size], className].filter(Boolean).join(' ');
  return (
    <span className={cls} role="img" aria-label={accessible}>
      {shown.map((person, index) => (
        <span key={`${index}:${person.name}`} className={styles.item} aria-hidden="true">
          <Avatar name={person.name} {...(person.src ? { src: person.src } : {})} size={size} />
        </span>
      ))}
      {hidden > 0 ? (
        <span className={`${styles.item} ${styles.more}`} aria-hidden="true">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
