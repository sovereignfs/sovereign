import { createHash } from 'node:crypto';
import { sanitiseSvg } from '../images/svg';
import { ImageError, inspectImage, MAX_IMAGE_BYTES } from '../images/validate';
import type { LauncherApp } from './launcher';

/**
 * Apps' launcher icons, served from core's own address (core-app §3.8), so that an app's header can show the launcher with images
 * from core alone. An icon is the address an app's launcher entry names, usually on the app's own host; core fetches it once,
 * keeps what the bytes prove to be a picture (PNG, JPEG or WebP, or an SVG rebuilt by `sanitiseSvg`), and serves that.
 *
 * Only the icons of apps the launcher lists are served: any other id is not there. Nothing a request says is fetched: the
 * address is the operator's, from the app's launcher entry.
 */

export type AppIcon = { bytes: Buffer; contentType: string; etag: string };

export type AppIconDeps = {
  /** The apps the launcher lists now. */
  listed: () => Promise<LauncherApp[]>;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

/** How long an icon is kept before it is fetched again, and how long a failure is remembered before trying again. */
export const ICON_KEPT_MS = 60 * 60 * 1000;
export const ICON_FAILURE_KEPT_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5_000;
const MAX_KEPT = 200;

type Kept = { url: string; icon: AppIcon | undefined; until: number };
const kept = new Map<string, Kept>();

/** Forgets every kept icon (for a test, or when an app's entry changes). */
export function forgetAppIcons(): void {
  kept.clear();
}

async function bodyOf(response: Response): Promise<Buffer | undefined> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const looksLikeSvg = (bytes: Buffer): boolean =>
  /<svg[\s>]/i.test(bytes.subarray(0, 4096).toString('utf8'));

/** What the bytes prove to be, or nothing: a picture of a kind core serves, an SVG rebuilt safe, or not a picture at all. */
function pictureOf(bytes: Buffer): Omit<AppIcon, 'etag'> | undefined {
  try {
    if (looksLikeSvg(bytes)) return { bytes: sanitiseSvg(bytes), contentType: 'image/svg+xml' };
    const inspected = inspectImage(bytes);
    return { bytes, contentType: inspected.contentType };
  } catch (error) {
    if (error instanceof ImageError) return undefined;
    throw error;
  }
}

async function fetchIcon(url: string, deps: AppIconDeps): Promise<AppIcon | undefined> {
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(url, {
      // An icon's address is the operator's; a redirect elsewhere is not followed.
      redirect: 'manual',
      signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS),
      headers: { accept: 'image/png, image/jpeg, image/webp, image/svg+xml' },
    });
  } catch {
    return undefined;
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  const bytes = await bodyOf(response).catch(() => undefined);
  const picture = bytes && pictureOf(bytes);
  if (!picture) return undefined;
  const etag = `"${createHash('sha256').update(picture.bytes).digest('base64url').slice(0, 22)}"`;
  return { ...picture, etag };
}

/** The icon of an app the launcher lists, from core: fetched when not kept or kept too long. Nothing for any other id. */
export async function appIcon(id: string, deps: AppIconDeps): Promise<AppIcon | undefined> {
  const app = (await deps.listed()).find((each) => each.id === id);
  if (!app?.icon) return undefined;
  const now = (deps.now ?? Date.now)();
  const have = kept.get(id);
  if (have && have.url === app.icon && have.until > now) return have.icon;
  const icon = await fetchIcon(app.icon, deps);
  if (kept.size >= MAX_KEPT && !kept.has(id)) kept.delete(kept.keys().next().value as string);
  kept.set(id, { url: app.icon, icon, until: now + (icon ? ICON_KEPT_MS : ICON_FAILURE_KEPT_MS) });
  return icon;
}

/** Where core serves an app's launcher icon: a path on core, the same for every person. */
export const appIconPath = (id: string): string => `/api/branding/apps/${encodeURIComponent(id)}`;
