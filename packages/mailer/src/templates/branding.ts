/** Branding data injected into every email. */
export interface EmailBranding {
  /** Display name — from instance emailFromName, falling back to the instance name. */
  name: string;
  /**
   * Absolute HTTPS URL to the logo image served from the instance.
   * Must be publicly reachable — Gmail and Outlook block `data:` URIs.
   * When undefined the header renders the brand name as text.
   */
  logoUrl?: string;
  /**
   * Hex colour (#rrggbb) used for CTA button backgrounds.
   * Defaults to #09090b (near-black) when undefined.
   */
  primaryColor?: string;
  /** Shown in the email footer. Should be the public base URL of the instance. */
  instanceUrl: string;
}

/** Locale and operator overrides for a specific render call. */
export interface EmailLocale {
  /** BCP 47 locale tag (en, de, si, ta). Falls back to 'en' when not available. */
  locale: string;
  /**
   * Operator-customised strings fetched from platform_settings, merged over
   * the built-in locale strings — any absent key uses the built-in value.
   */
  overrides?: Partial<Record<string, string>>;
}

export const DEFAULT_PRIMARY_COLOR = '#09090b';
