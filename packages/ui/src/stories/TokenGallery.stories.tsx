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
  '--sv-color-focus-ring',
  '--sv-color-error-surface',
  '--sv-color-error-text',
  '--sv-color-error-border',
  '--sv-color-warning-surface',
  '--sv-color-warning-text',
  '--sv-color-warning-border',
  '--sv-color-success-surface',
  '--sv-color-success-text',
  '--sv-color-success-border',
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
const ICON_SIZE_TOKENS = ['--sv-icon-size-sm', '--sv-icon-size-md', '--sv-icon-size-lg'];

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

const SHADOW_TOKENS = [
  '--sv-shadow-card',
  '--sv-shadow-hover',
  '--sv-shadow-popover',
  '--sv-shadow-overlay',
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontFamily: 'system-ui, sans-serif',
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
        fontFamily: 'system-ui, sans-serif',
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

      <Section title="Radius scale">
        {RADIUS_TOKENS.map((t) => (
          <ScaleRow
            key={t}
            token={t}
            renderPreview={(_v) => (
              <div
                style={{
                  width: 40,
                  height: 24,
                  background: 'var(--sv-color-accent)',
                  borderRadius: `var(${t})`,
                  flexShrink: 0,
                }}
              />
            )}
          />
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
