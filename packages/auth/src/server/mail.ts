/** The person an email is for. */
export type Recipient = { email: string; name: string };

/**
 * The emails sign-in sends (auth.md §3, §4 rule 9), apart from better-auth so tests can watch them.
 *
 * Whether mail can be sent at all is asked up front (`unavailable`), so a request that needs it
 * fails the same way for every address. A send that goes wrong after that (the mail server is
 * down) is logged and never thrown: the request has already answered, in the same words as when
 * it works, because an answer that changed with a failed send would tell whether the address has
 * an account.
 */
export type AuthMail = {
  /** Why mail cannot be sent now, for the log, or `undefined` when it can. */
  unavailable(): Promise<string | undefined>;
  verification(to: Recipient, link: string): Promise<void>;
  passwordReset(to: Recipient, link: string): Promise<void>;
  accountCreated(to: Recipient): Promise<void>;
};
