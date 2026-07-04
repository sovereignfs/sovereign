const DEFAULT_INSTANCE_NAME = 'Sovereign';

export function resolveInstanceName(value: string | null | undefined): string {
  return value?.trim() || DEFAULT_INSTANCE_NAME;
}
