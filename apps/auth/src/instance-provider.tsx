import type { ReactNode } from 'react';

interface InstanceConfig {
  instanceName: string;
  instanceLogo: string | null;
  instanceLogoDark: string | null;
  instancePrimary: string | null;
}

const ACCENT_HOVER_LIGHTNESS_DELTA = 8;

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function buildStyle(config: InstanceConfig): string {
  const lines: string[] = [];
  if (config.instanceLogo) {
    lines.push(`  --sv-instance-logo: url(${JSON.stringify(config.instanceLogo)});`);
  }
  if (config.instanceLogoDark) {
    lines.push(`  --sv-instance-logo-dark: url(${JSON.stringify(config.instanceLogoDark)});`);
  }
  if (config.instancePrimary) {
    const [h, s, l] = hexToHsl(config.instancePrimary);
    const hoverLLight = Math.max(0, Math.min(100, l - ACCENT_HOVER_LIGHTNESS_DELTA));
    const hoverLDark = Math.max(0, Math.min(100, l + ACCENT_HOVER_LIGHTNESS_DELTA));
    lines.push(`  --sv-color-accent: hsl(${h}, ${s}%, ${l}%);`);
    lines.push(`  --sv-color-accent-hover: hsl(${h}, ${s}%, ${hoverLLight}%);`);
    return (
      `:root {\n${lines.join('\n')}\n}` +
      `\n[data-theme='dark'] {\n  --sv-color-accent-hover: hsl(${h}, ${s}%, ${hoverLDark}%);\n}`
    );
  }
  return lines.length > 0 ? `:root {\n${lines.join('\n')}\n}` : '';
}

const FALLBACK_CONFIG: InstanceConfig = {
  instanceName: 'Sovereign',
  instanceLogo: null,
  instanceLogoDark: null,
  instancePrimary: null,
};

async function fetchInstanceConfig(): Promise<InstanceConfig> {
  const runtimeInternalUrlKey = 'SOVEREIGN_RUNTIME_INTERNAL_URL';
  const runtimeUrl = process.env[runtimeInternalUrlKey] ?? 'http://localhost:3000';
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${runtimeUrl}/api/admin/instance-config`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as InstanceConfig;
  } catch {
    return {
      ...FALLBACK_CONFIG,
      instanceName: process.env.INSTANCE_NAME ?? 'Sovereign',
    };
  }
}

export interface AuthInstanceContext {
  instanceName: string;
}

interface AuthInstanceProviderProps {
  children: (ctx: AuthInstanceContext) => ReactNode;
}

/**
 * Server component — fetches instance config from the runtime (60 s Next.js
 * cache), injects CSS custom properties, and passes the instance name to
 * child layouts. Gracefully falls back to Sovereign defaults when the runtime
 * is unreachable.
 */
export async function AuthInstanceProvider({
  children,
}: AuthInstanceProviderProps): Promise<ReactNode> {
  const config = await fetchInstanceConfig();
  const styleContent = buildStyle(config);
  const ctx: AuthInstanceContext = { instanceName: config.instanceName };

  return (
    <>
      {styleContent ? <style dangerouslySetInnerHTML={{ __html: styleContent }} /> : null}
      {children(ctx)}
    </>
  );
}
