/**
 * Starting points for the "Add a provider" form. Every entry is an
 * OpenAI-compatible endpoint; picking one fills the name and base URL so the
 * common case is "choose, paste key, done" rather than remembering (or
 * mistyping) `/api/v1` vs `/v1`. The user can still edit both fields, and
 * "Custom" leaves them blank. Zero imports — the form is a client component.
 *
 * Self-hosted servers have no fixed host, so their `baseUrl` is empty and
 * `baseUrlHint` shows the shape instead; they typically need no real key,
 * but the field is still required (a placeholder like `none` is fine —
 * the request just carries a meaningless bearer token).
 */
export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  baseUrlHint?: string;
}

export const CUSTOM_PRESET_ID = 'custom';

/** The form's starting selection — the most common hosted aggregator. */
export const DEFAULT_PRESET: ProviderPreset = {
  id: 'openrouter',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
};

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  DEFAULT_PRESET,
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  {
    id: 'ollama',
    label: 'Ollama (self-hosted)',
    baseUrl: '',
    baseUrlHint: 'e.g. http://192.168.1.20:11434/v1 — the machine running Ollama',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (self-hosted)',
    baseUrl: '',
    baseUrlHint: 'e.g. http://192.168.1.20:1234/v1 — the machine running LM Studio',
  },
  { id: CUSTOM_PRESET_ID, label: 'Custom', baseUrl: '' },
];

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}
