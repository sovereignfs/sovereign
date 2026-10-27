/**
 * A pragmatic check for an email address, enough to refuse what can do harm (whitespace, control
 * characters, a second address, a header injected through a line break) and what is plainly not an
 * address. It does not try to be RFC 5322: the server is the judge of whether a mailbox exists.
 * Written without a backtracking pattern over the whole input, so a long hostile value costs
 * linear time.
 */
const LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function isEmailAddress(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!LOCAL.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) => LABEL.test(label));
}

/** `address` or `Name <address>`: the sender forms. The name may not contain a line break or angle bracket. */
export function isSender(value: string): boolean {
  if (value.length > 320) return false;
  const open = value.indexOf('<');
  if (open === -1) return isEmailAddress(value);
  if (!value.endsWith('>') || value.indexOf('<', open + 1) !== -1) return false;
  const name = value.slice(0, open).trim();
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[\u0000-\u001f\u007f<>"]/.test(name)) return false;
  return isEmailAddress(value.slice(open + 1, -1));
}
