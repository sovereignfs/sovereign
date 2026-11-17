import { MAX_SHORTCUT_ICON_BYTES, ShortcutError, type ShortcutInput } from './manager';

/** What is wrong beside each field of the shortcut form. */
export type ShortcutFieldProblems = Partial<
  Record<'name' | 'url' | 'description' | 'icon', string>
>;

/** What the shortcut forms' actions answer. A success leaves the page, so it says nothing more. */
export type ShortcutFormResult =
  { ok: true; message: string } | { ok: false; error: string; fields: ShortcutFieldProblems };

const text = (value: FormDataEntryValue | null): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The form's fields as the manager takes them. `icon` says which icon the person chose: `symbol` (with `symbol`),
 * `image` (with the uploaded `image`), `keep` (the picture already there) or `none` (a letter from the name). A
 * picture larger than the limit is refused here, before it is read.
 */
export async function shortcutFromForm(form: FormData): Promise<ShortcutInput> {
  const mode = text(form.get('icon'));
  const input: ShortcutInput = {
    name: text(form.get('name')),
    url: text(form.get('url'))?.trim(),
    description: text(form.get('description')),
  };
  if (mode === 'symbol') input.symbol = text(form.get('symbol')) ?? '';
  if (mode === 'keep') input.keepImage = true;
  if (mode === 'image') {
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0) {
      const message = 'Choose a picture to upload.';
      throw new ShortcutError('invalid', message, [{ field: 'icon', message }]);
    }
    if (file.size > MAX_SHORTCUT_ICON_BYTES) {
      const message = 'The picture is larger than 256 KB.';
      throw new ShortcutError('invalid', message, [{ field: 'icon', message }]);
    }
    input.image = Buffer.from(await file.arrayBuffer());
  }
  return input;
}

/** An expected refusal as the form shows it; anything else is a fault, and is thrown. */
export function refusedForm(error: unknown): ShortcutFormResult {
  if (!(error instanceof ShortcutError)) throw error;
  const fields: ShortcutFieldProblems = {};
  for (const { field, message } of error.problems) {
    if (field === 'name' || field === 'url' || field === 'description' || field === 'icon') {
      fields[field] ??= message;
    }
  }
  return { ok: false, error: error.message, fields };
}
