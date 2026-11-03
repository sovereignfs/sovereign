import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import styles from './Auth.module.css';

export interface AuthCodeInputProps {
  /** What the group is called for a screen reader, and shown above the boxes. */
  label: string;
  /** The digits typed so far, at most `length` of them. */
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * A code of digits, one box for each. Typing moves on to the next box, backspace to the one before, and a
 * pasted code fills them all. The first box is offered to a password manager and the phone's keyboard as a
 * one-time code.
 */
export function AuthCodeInput({
  label,
  value,
  onChange,
  length = 6,
  disabled,
  invalid,
}: AuthCodeInputProps) {
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  const labelId = `${useId()}-label`;
  const digits = Array.from({ length }, (_, at) => value[at] ?? '');

  function typeDigit(index: number, typed: string) {
    const digit = typed.replace(/\D/g, '').slice(-1);
    const next = digits.map((was, at) => (at === index ? digit : was));
    onChange(next.join(''));
    if (digit) cells.current[index + 1]?.focus();
  }

  function backspace(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index]) cells.current[index - 1]?.focus();
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    cells.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <p id={labelId} className={styles.label}>
          {label}
        </p>
      </div>
      <div className={styles.codeRow} role="group" aria-labelledby={labelId}>
        {digits.map((digit, at) => (
          <input
            // The boxes never change places, so their position is their identity.
            key={at}
            ref={(element) => {
              cells.current[at] = element;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            autoComplete={at === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${at + 1}`}
            disabled={disabled}
            className={invalid ? `${styles.codeCell} ${styles.codeCellError}` : styles.codeCell}
            // A box that is full takes no more typing, so a focused one is selected and the next digit replaces it.
            onFocus={(event) => event.target.select()}
            onChange={(event) => typeDigit(at, event.target.value)}
            onKeyDown={(event) => backspace(at, event)}
            onPaste={paste}
          />
        ))}
      </div>
    </div>
  );
}
