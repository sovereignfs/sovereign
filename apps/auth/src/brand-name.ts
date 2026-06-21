/** The brand name for this deployment. Falls back to 'Sovereign' when not set. */
export function brandName(): string {
  return process.env.BRAND_NAME || 'Sovereign';
}
