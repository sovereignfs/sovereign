/**
 * What a server action of an account panel answers (the design system's error convention): an expected failure is never thrown, it is
 * said in one sentence the person can act on, beside what they were doing.
 */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** A server action as `useActionState` takes it. */
export type PanelAction = (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;
