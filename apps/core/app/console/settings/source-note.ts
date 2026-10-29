import type { SettingSource } from '../../../src/settings/store';

/** Where a value comes from, in the words an operator reads next to it. */
export function sourceNote(source: SettingSource): string {
  switch (source) {
    case 'saved':
      return 'Saved here.';
    case 'environment':
      return 'Set by the server’s environment.';
    case 'default':
      return 'The default.';
    default:
      return 'Not set.';
  }
}
