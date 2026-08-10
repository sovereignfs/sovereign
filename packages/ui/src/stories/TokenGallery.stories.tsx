import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

// ---------------------------------------------------------------------------
// Token Gallery — live rendering of every CSS custom property tier.
// Values are read from the computed style at render time so they always
// reflect the actual loaded CSS, not a hardcoded snapshot. Toggle dark mode
// via the Themes toolbar to compare both theme values side-by-side.
// ---------------------------------------------------------------------------

const SEMANTIC_COLORS = [
  '--sv-color-surface',
  '--sv-color-surface-sunken',
  '--sv-color-surface-raised',
  '--sv-color-text-primary',
  '--sv-color-text-muted',
  '--sv-color-text-subtle',
  '--sv-color-text-on-accent',
  '--sv-color-border',
  '--sv-color-border-strong',
  '--sv-color-accent',
  '--sv-color-accent-hover',
  '--sv-color-accent-subtle',
  '--sv-color-focus-ring',
  '--sv-color-error-surface',
  '--sv-color-error-text',
  '--sv-color-error-border',
  '--sv-color-error-solid',
  '--sv-color-warning-surface',
  '--sv-color-warning-text',
  '--sv-color-warning-border',
  '--sv-color-success-surface',
  '--sv-color-success-text',
  '--sv-color-success-border',
  '--sv-color-success-solid',
  '--sv-color-text-on-error',
  '--sv-color-text-on-success',
  '--sv-color-info-surface',
  '--sv-color-info-text',
  '--sv-color-info-border',
  '--sv-color-scrim',
];

const SPACE_TOKENS = [
  '--sv-space-1',
  '--sv-space-2',
  '--sv-space-3',
  '--sv-space-4',
  '--sv-space-5',
  '--sv-space-6',
  '--sv-space-8',
  '--sv-space-10',
  '--sv-space-12',
  '--sv-space-16',
];

const RADIUS_TOKENS = [
  '--sv-radius-sm',
  '--sv-radius-md',
  '--sv-radius-lg',
  '--sv-radius-xl',
  '--sv-radius-2xl',
  '--sv-radius-3xl',
  '--sv-radius-full',
];
// RFC 0077 — instance corner-radius presets. Base px values mirror
// primitives.css's own comments (sm 6px, md 8px, xl 12px at scale 1).
//
// Each swatch's radius is computed here in JS rather than by overriding
// --sv-radius-scale on a local wrapper and letting --sv-radius-md etc.
// recompute from it. That would be the more elegant approach, but CSS custom
// properties don't support it: a custom property that references another
// custom property inside calc() (--sv-radius-md: calc(var(--sv-radius-scale)
// * 0.5rem)) has that inner reference resolved once, at the element where
// --sv-radius-md itself is *declared* (:root in primitives.css) — not at
// wherever it's later consumed via var(). A descendant overriding
// --sv-radius-scale doesn't reach back and change --sv-radius-md's
// already-fixed value (confirmed empirically — this isn't a guess). The
// production mechanism (instance-provider.tsx) still works fine: its
// override is injected as another :root { } rule, the *same* cascade node
// primitives.css declares --sv-radius-md at, not a descendant — but a
// side-by-side, multi-preset comparison on one page has no such single
// :root to share, so the swatches below compute the resulting px directly.
const RADIUS_PRESETS = [
  { preset: 'none', scale: 0 },
  { preset: 'xs', scale: 0.35 },
  { preset: 's', scale: 0.65 },
  { preset: 'm', scale: 1 },
  { preset: 'l', scale: 2.75 },
] as const;

const RADIUS_BASE_PX = { sm: 6, md: 8, xl: 12 };

const ICON_SIZE_TOKENS = [
  '--sv-icon-size-xs',
  '--sv-icon-size-sm',
  '--sv-icon-size-md',
  '--sv-icon-size-lg',
];

const FONT_SIZE_TOKENS = [
  '--sv-font-size-label',
  '--sv-font-size-xs',
  '--sv-font-size-caption',
  '--sv-font-size-sm',
  '--sv-font-size-md',
  '--sv-font-size-lg',
  '--sv-font-size-xl',
  '--sv-font-size-2xl',
];

// Task 10.2 — in-app text-size control. --sv-text-size-scale is theme-stable
// like --sv-radius-scale, but unlike radius (a calc() chain resolved once at
// :root's declaration site — see the RADIUS_PRESETS comment below), rem units
// genuinely re-resolve against the root element's live computed font-size, so
// these swatches compute the result directly in JS rather than needing a real
// [data-text-size] toggle on the document root.
const TEXT_SIZE_PRESETS = [
  { preset: 'default', scale: 1 },
  { preset: 'large', scale: 1.125 },
  { preset: 'larger', scale: 1.25 },
] as const;

const TEXT_SIZE_BASE_PX = { md: 16, lg: 18, '2xl': 24 };

const FONT_WEIGHT_TOKENS = [
  '--sv-font-weight-normal',
  '--sv-font-weight-medium',
  '--sv-font-weight-semibold',
  '--sv-font-weight-bold',
];

const SHADOW_TOKENS = [
  '--sv-shadow-card',
  '--sv-shadow-hover',
  '--sv-shadow-popover',
  '--sv-shadow-overlay',
  '--sv-shadow-control',
];

// Realistic duration+easing pairings, not every combination — matches how
// Dialog/Drawer actually use these tokens (see motion.ts).
const MOTION_PAIRS: { durationToken: string; easeToken: string; use: string }[] = [
  {
    durationToken: '--sv-motion-duration-fast',
    easeToken: '--sv-motion-ease-out',
    use: 'micro-interaction',
  },
  {
    durationToken: '--sv-motion-duration-base',
    easeToken: '--sv-motion-ease-out',
    use: 'Dialog / Drawer entrance',
  },
  {
    durationToken: '--sv-motion-duration-slow',
    easeToken: '--sv-motion-ease-in-out',
    use: 'larger surface / longer travel',
  },
  {
    durationToken: '--sv-motion-duration-base',
    easeToken: '--sv-motion-ease-spring',
    use: 'emphasis (use sparingly)',
  },
];

// ---------------------------------------------------------------------------

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '6px 0',
  borderBottom: '1px solid var(--sv-color-border)',
};

const label: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '13px',
  color: 'var(--sv-color-text-primary)',
  minWidth: '300px',
};

const value: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '12px',
  color: 'var(--sv-color-text-muted)',
  flex: 1,
};

// ---------------------------------------------------------------------------

function ColorRow({ token }: { token: string }) {
  const computed =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(token).trim()
      : '';
  const swatch: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 4,
    background: `var(${token})`,
    border: '1px solid var(--sv-color-border)',
    flexShrink: 0,
  };
  return (
    <div style={row}>
      <div style={swatch} />
      <span style={label}>{token}</span>
      <span style={value}>{computed}</span>
    </div>
  );
}

function ScaleRow({
  token,
  renderPreview,
}: {
  token: string;
  renderPreview: (v: string) => React.ReactNode;
}) {
  const computed =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(token).trim()
      : '';
  return (
    <div style={row}>
      {renderPreview(computed)}
      <span style={label}>{token}</span>
      <span style={value}>{computed}</span>
    </div>
  );
}

// Radius tokens are calc() expressions since RFC 0077 (proportional to
// --sv-radius-scale) — reading the raw custom property text now shows the
// unresolved formula (e.g. "calc(1 * 0.375rem)"), not a pixel value. Render
// the swatch, then read the browser's own computed border-radius off it
// (a real CSS property, so calc() is fully resolved) instead of ScaleRow's
// getPropertyValue text read.
function RadiusScaleRow({ token }: { token: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [resolved, setResolved] = useState('');
  useEffect(() => {
    if (ref.current) setResolved(getComputedStyle(ref.current).borderRadius);
  }, []);
  return (
    <div style={row}>
      <div
        ref={ref}
        style={{
          width: 40,
          height: 24,
          background: 'var(--sv-color-accent)',
          borderRadius: `var(${token})`,
          flexShrink: 0,
        }}
      />
      <span style={label}>{token}</span>
      <span style={value}>{resolved}</span>
    </div>
  );
}

function TextSizePresetRow({ preset, scale }: { preset: string; scale: number }) {
  return (
    <div style={row}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexShrink: 0, width: 180 }}>
        <span
          style={{
            fontSize: `${scale * TEXT_SIZE_BASE_PX.md}px`,
            color: 'var(--sv-color-text-primary)',
          }}
          title="body (--sv-font-size-md)"
        >
          Aa
        </span>
        <span
          style={{
            fontSize: `${scale * TEXT_SIZE_BASE_PX.lg}px`,
            color: 'var(--sv-color-text-primary)',
          }}
          title="large (--sv-font-size-lg)"
        >
          Aa
        </span>
        <span
          style={{
            fontSize: `${scale * TEXT_SIZE_BASE_PX['2xl']}px`,
            color: 'var(--sv-color-text-primary)',
          }}
          title="heading (--sv-font-size-2xl)"
        >
          Aa
        </span>
      </div>
      <span style={label}>{preset}</span>
      <span style={value}>scale {scale}</span>
    </div>
  );
}

function RadiusPresetRow({ preset, scale }: { preset: string; scale: number }) {
  return (
    <div style={row}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
        <div
          style={{
            width: 56,
            height: 40,
            background: 'var(--sv-color-surface-sunken)',
            border: '1px solid var(--sv-color-border)',
            borderRadius: `${scale * RADIUS_BASE_PX.xl}px`,
          }}
          title="card (--sv-radius-xl)"
        />
        <div
          style={{
            width: 64,
            height: 36,
            background: 'var(--sv-color-accent)',
            borderRadius: `${scale * RADIUS_BASE_PX.md}px`,
          }}
          title="button, 36px tall (--sv-radius-md)"
        />
        <div
          style={{
            width: 48,
            height: 18,
            background: 'var(--sv-color-accent-subtle)',
            borderRadius: `${scale * RADIUS_BASE_PX.sm}px`,
          }}
          title="badge, 18px tall (--sv-radius-sm)"
        />
      </div>
      <span style={label}>{preset}</span>
      <span style={value}>scale {scale}</span>
    </div>
  );
}

// Auto-loops so the duration/easing is visible without needing to interact —
// same technique Dialog/Drawer use for their own open/close transition
// (see motion.ts), just driven by a timer instead of an `open` prop.
function MotionRow({ durationToken, easeToken, use }: (typeof MOTION_PAIRS)[number]) {
  const [toggled, setToggled] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setToggled((v) => !v), 900);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={row}>
      <div
        style={{
          position: 'relative',
          width: 120,
          height: 24,
          background: 'var(--sv-color-surface-sunken)',
          borderRadius: 4,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--sv-color-accent)',
            transform: `translateX(${toggled ? 96 : 0}px)`,
            transition: `transform var(${durationToken}) var(${easeToken})`,
          }}
        />
      </div>
      <span style={label}>
        {durationToken} · {easeToken}
      </span>
      <span style={value}>{use}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontFamily: 'var(--sv-font-family)',
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--sv-color-text-primary)',
          marginBottom: 12,
          borderBottom: '2px solid var(--sv-color-accent)',
          paddingBottom: 4,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------

function TokenGalleryComponent() {
  return (
    <div
      style={{
        padding: 24,
        background: 'var(--sv-color-surface)',
        minHeight: '100vh',
        fontFamily: 'var(--sv-font-family)',
      }}
    >
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--sv-color-text-primary)',
          marginBottom: 8,
        }}
      >
        Sovereign Design Token Gallery
      </h1>
      <p style={{ color: 'var(--sv-color-text-muted)', marginBottom: 32, fontSize: 14 }}>
        All values are read live from computed styles — they reflect the actual loaded CSS, not a
        hardcoded snapshot. Use the Themes toolbar above to switch dark mode.
      </p>

      <Section title="Semantic colours">
        {SEMANTIC_COLORS.map((t) => (
          <ColorRow key={t} token={t} />
        ))}
      </Section>

      <Section title="Space scale">
        {SPACE_TOKENS.map((t) => (
          <ScaleRow
            key={t}
            token={t}
            renderPreview={(_v) => (
              <div
                style={{
                  width: `var(${t})`,
                  height: 16,
                  background: 'var(--sv-color-accent)',
                  flexShrink: 0,
                  minWidth: 4,
                }}
              />
            )}
          />
        ))}
      </Section>

      <Section title="Font weight scale">
        {FONT_WEIGHT_TOKENS.map((t) => (
          <ScaleRow
            key={t}
            token={t}
            renderPreview={(_v) => (
              <span
                style={{
                  fontFamily: 'var(--sv-font-family)',
                  fontSize: 'var(--sv-font-size-md)',
                  fontWeight: `var(${t})`,
                  color: 'var(--sv-color-text-primary)',
                  minWidth: 100,
                }}
              >
                Sovereign
              </span>
            )}
          />
        ))}
      </Section>

      <Section title="Typography scale">
        {FONT_SIZE_TOKENS.map((t) => (
          <ScaleRow
            key={t}
            token={t}
            renderPreview={(_v) => (
              <span
                style={{
                  fontSize: `var(${t})`,
                  color: 'var(--sv-color-text-primary)',
                  minWidth: 100,
                  lineHeight: 1,
                }}
              >
                Aa
              </span>
            )}
          />
        ))}
      </Section>

      <Section title="Text-size presets (task 10.2)">
        <p style={{ color: 'var(--sv-color-text-muted)', fontSize: 13, marginBottom: 12 }}>
          Account → Preferences → Appearance. Overrides <code>--sv-text-size-scale</code> via{' '}
          <code>[data-text-size]</code> on <code>&lt;html&gt;</code> — every rem-based token above
          (font sizes, but also spacing and radii) scales with it, since the root element&apos;s
          font-size is what rem resolves against. Discharges the accessibility debt from disabling
          pinch-zoom (<code>runtime/app/layout.tsx</code>).
        </p>
        {TEXT_SIZE_PRESETS.map((p) => (
          <TextSizePresetRow key={p.preset} preset={p.preset} scale={p.scale} />
        ))}
      </Section>

      <Section title="Radius scale">
        {RADIUS_TOKENS.map((t) => (
          <RadiusScaleRow key={t} token={t} />
        ))}
      </Section>

      <Section title="Radius presets (RFC 0077)">
        <p style={{ color: 'var(--sv-color-text-muted)', fontSize: 13, marginBottom: 12 }}>
          Instance-level corner-radius intensity — Console → Instance identity, or{' '}
          <code>INSTANCE_RADIUS</code>. Overrides <code>--sv-radius-scale</code>; every{' '}
          <code>--sv-radius-*</code> token above stays proportional to it. Note how the button
          swatch clips to a full pill by L — <code>border-radius</code>&apos;s own half-height
          clamp, not a separate mechanism.
        </p>
        {RADIUS_PRESETS.map((p) => (
          <RadiusPresetRow key={p.preset} preset={p.preset} scale={p.scale} />
        ))}
      </Section>

      <Section title="Icon sizes">
        {ICON_SIZE_TOKENS.map((t) => (
          <ScaleRow
            key={t}
            token={t}
            renderPreview={(_v) => (
              <div
                style={{
                  width: `var(${t})`,
                  height: `var(${t})`,
                  background: 'var(--sv-color-accent)',
                  borderRadius: 2,
                  flexShrink: 0,
                }}
              />
            )}
          />
        ))}
      </Section>

      <Section title="Shadows">
        {SHADOW_TOKENS.map((t) => (
          <ScaleRow
            key={t}
            token={t}
            renderPreview={(_v) => (
              <div
                style={{
                  width: 48,
                  height: 28,
                  background: 'var(--sv-color-surface-raised)',
                  boxShadow: `var(${t})`,
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              />
            )}
          />
        ))}
      </Section>

      <Section title="Motion">
        {MOTION_PAIRS.map((pair) => (
          <MotionRow key={`${pair.durationToken}-${pair.easeToken}`} {...pair} />
        ))}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

const meta = {
  title: 'Design Tokens/Token Gallery',
  component: TokenGalleryComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Live gallery of every `--sv-*` CSS custom property. Values are read from `getComputedStyle` at render time — toggle dark mode via the Themes toolbar to see both themes.',
      },
    },
  },
} satisfies Meta<typeof TokenGalleryComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTokens: Story = {};
