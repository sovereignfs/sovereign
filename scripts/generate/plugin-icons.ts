import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PLUGINS_DIR, PLUGIN_ICONS_DIR } from './paths';
import type { PluginEntry } from './types';

/**
 * Background color for a generated maskable plugin icon's opaque plate.
 * Matches the `#09090b` both manifest routes (instance-level and per-plugin,
 * `runtime/app/api/manifest/route.ts` / `[pluginId]/route.ts`) already
 * hardcode as `theme_color`/`background_color` — there is no per-instance
 * `background_color` config field anywhere in the platform today (only
 * `instancePrimary`/`instanceRadius` do), and these icons are static,
 * build-time PNGs baked into one Docker image shared across every
 * deployment, so they couldn't vary per-instance even if that field existed
 * (RFC 0081 open question 1).
 */
const MASKABLE_ICON_BACKGROUND = '#09090b';
/** Fraction of the 512×512 maskable canvas the glyph occupies — safely inside
 * the platform mask safe zone (a centered ~80%-diameter circle), so no
 * platform's mask shape clips it. */
const MASKABLE_ICON_MARK_RATIO = 0.6;

/** Rasterize an SVG buffer to a transparent PNG at size×size, following
 * `scripts/generate-splash.ts`'s density heuristic for crisp vector→raster
 * conversion at small target sizes. */
async function rasterizeIcon(svg: Buffer, size: number): Promise<Buffer> {
  const density = Math.min(2400, Math.ceil((size / 64) * 72));
  return sharp(svg, { density }).resize(size, size, { fit: 'contain' }).png().toBuffer();
}

/**
 * A 512×512 maskable variant: the glyph centered on an opaque background
 * plate, same composite-onto-a-solid-canvas technique
 * `scripts/generate-splash.ts` already uses. A transparent maskable icon
 * renders as a floating glyph on a platform-chosen background and looks
 * broken on Android (RFC 0081 §3) — this must never be transparent.
 */
async function rasterizeMaskableIcon(svg: Buffer): Promise<Buffer> {
  const markSize = Math.round(512 * MASKABLE_ICON_MARK_RATIO);
  const mark = await rasterizeIcon(svg, markSize);
  return sharp({
    create: { width: 512, height: 512, channels: 4, background: MASKABLE_ICON_BACKGROUND },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

/**
 * Copy each plugin's `icon.svg` into `runtime/public/plugin-icons/<id>.svg`
 * — used directly by the sidebar/Launcher tiles, and as the rasterization
 * source below — so it's served statically at `/plugin-icons/<id>.svg`
 * without a session gate. For every `installable: true` plugin — schema
 * validation (`packages/manifest`) already guarantees `icon` or `icons` is
 * present, so this never has to handle "neither" for a real build — also
 * produces the raster set its own PWA manifest needs
 * (`runtime/src/plugin-manifest.ts`'s `buildPluginManifestIcons`): a
 * 192×192, a 512×512, and a maskable 512×512 (RFC 0081 §3). An
 * author-supplied `icons` path (for a glyph that rasterizes poorly) is
 * copied verbatim instead of generated, per variant independently — a
 * plugin can mix generated and author-supplied variants. Everything under
 * this directory is gitignored generated content, same as composed routes.
 */
export async function copyPluginIcons(plugins: PluginEntry[]): Promise<void> {
  mkdirSync(PLUGIN_ICONS_DIR, { recursive: true });
  pruneStalePluginIcons(
    PLUGIN_ICONS_DIR,
    new Set(plugins.map((plugin) => plugin.manifest.id)),
    new Set(
      plugins
        .filter((plugin) => plugin.manifest.installable === true)
        .map((plugin) => plugin.manifest.id),
    ),
  );
  for (const { dir, manifest, baseDir } of plugins) {
    const pluginDir = join(baseDir ?? PLUGINS_DIR, dir);
    const iconSrc = join(pluginDir, 'icon.svg');
    const hasIcon = existsSync(iconSrc);
    if (hasIcon) cpSync(iconSrc, join(PLUGIN_ICONS_DIR, `${manifest.id}.svg`));
    if (manifest.installable !== true) continue;

    const svg = hasIcon ? readFileSync(iconSrc) : null;
    const authored = manifest.icons;
    const variants: [
      authoredPath: string | undefined,
      filename: string,
      generate: () => Promise<Buffer>,
    ][] = [
      [authored?.png192, `${manifest.id}-192.png`, () => rasterizeIcon(svg as Buffer, 192)],
      [authored?.png512, `${manifest.id}-512.png`, () => rasterizeIcon(svg as Buffer, 512)],
      [
        authored?.maskable512,
        `${manifest.id}-maskable-512.png`,
        () => rasterizeMaskableIcon(svg as Buffer),
      ],
    ];
    for (const [authoredPath, filename, generate] of variants) {
      const dest = join(PLUGIN_ICONS_DIR, filename);
      if (authoredPath) {
        cpSync(join(pluginDir, authoredPath), dest);
      } else if (svg) {
        writeFileSync(dest, await generate());
      }
    }
  }
}

/**
 * Removes stale plugin icon files: everything for a plugin no longer
 * installed at all, and — a distinct case, easy to miss — just the PNGs for
 * a plugin that's still installed but is no longer `installable: true`
 * (its `.svg` stays, since the sidebar/Launcher tiles use it regardless of
 * `installable`). `installablePluginIds` defaults to `activePluginIds`,
 * preserving old callers' exact behavior (every active plugin's PNGs kept)
 * when a caller has no reason to distinguish the two sets.
 */
export function pruneStalePluginIcons(
  iconsDir: string,
  activePluginIds: Set<string>,
  installablePluginIds: Set<string> = activePluginIds,
): void {
  for (const entry of readdirSync(iconsDir)) {
    const isPng = entry.endsWith('.png');
    // Longest/most-specific suffix first — "-512.png" is itself a suffix of
    // "-maskable-512.png", so checking it first would strip the wrong part
    // and leave "<id>-maskable" mistaken for the plugin id.
    const id = entry
      .replace(/-maskable-512\.png$/, '')
      .replace(/-512\.png$/, '')
      .replace(/-192\.png$/, '')
      .replace(/\.svg$/, '');
    if (!activePluginIds.has(id) || (isPng && !installablePluginIds.has(id))) {
      rmSync(join(iconsDir, entry), { force: true });
    }
  }
}
