const REDACTED = '[redacted]';

/**
 * A value that must not end up in a log. It prints as `[redacted]` however it is
 * rendered - `String()`, a template, `JSON.stringify`, `util.inspect`, a spread or a
 * structured clone - and gives the value back only through `reveal()`, so the
 * places that really need it are easy to find and the places that do not cannot
 * leak it by accident.
 */
export class Secret {
  // A private field is not an own property: Object.keys, spread, JSON and
  // structuredClone never see it.
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The secret itself. Call this only where it is actually used. */
  reveal(): string {
    return this.#value;
  }

  get length(): number {
    return this.#value.length;
  }

  /** Compares without exposing either value, and without stopping at the first difference. */
  equals(other: Secret): boolean {
    const a = this.#value;
    const b = other.reveal();
    let difference = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return difference === 0;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  // What `util.inspect` and `console.log` use. Symbol.for avoids importing node:util.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `Secret(${REDACTED})`;
  }
}
