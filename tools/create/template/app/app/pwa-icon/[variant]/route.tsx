import { ImageResponse } from 'next/og';

/**
 * The app's icons, as PNGs drawn from its initial: the sizes the manifest names (`iconSet()` in `@sovereignfs/pwa`), one drawn to be
 * masked (its mark inside the middle 80%), and the 180 pixel one an iPhone puts on its Home Screen. Replace them with your own pictures
 * when you have them, at the same addresses. Made once, at build time.
 */
const VARIANTS: Record<string, { size: number; mark: number }> = {
  '192': { size: 192, mark: 0.6 },
  '512': { size: 512, mark: 0.6 },
  maskable: { size: 512, mark: 0.45 },
  apple: { size: 180, mark: 0.6 },
};

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const icon = Object.hasOwn(VARIANTS, variant) ? VARIANTS[variant] : undefined;
  if (!icon) return new Response(null, { status: 404 });
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#18181b',
        color: '#ffffff',
        fontSize: Math.round(icon.size * icon.mark),
        fontWeight: 600,
      }}
    >
      {'__TITLE__'.charAt(0)}
    </div>,
    { width: icon.size, height: icon.size },
  );
}
