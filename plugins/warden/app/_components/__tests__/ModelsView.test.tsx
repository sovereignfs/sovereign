// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '@sovereignfs/ui';
import type { ModelDiscoveryResult } from '../../_lib/model-discovery';
import { ModelsView } from '../ModelsView';

const setModelVisibilityAction = vi.fn();
vi.mock('../../actions', () => ({
  setModelVisibilityAction: (...args: unknown[]) => setModelVisibilityAction(...args),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function discovery(overrides: Partial<ModelDiscoveryResult> = {}): ModelDiscoveryResult {
  return {
    local: { available: false, message: null },
    providers: [],
    models: [],
    ...overrides,
  };
}

function renderView(discoveryResult: ModelDiscoveryResult, visibilityOverrides: string[] = []) {
  return render(
    <ToastProvider>
      <ModelsView discovery={discoveryResult} visibilityOverrides={visibilityOverrides} />
    </ToastProvider>,
  );
}

const openRouterProvider = {
  id: 'conn-1',
  label: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  ok: true,
  message: null,
  modelCount: 1,
};

describe('ModelsView', () => {
  it('shows an empty state when nothing has been discovered at all', () => {
    renderView(discovery());
    expect(screen.getByText('No models yet')).toBeDefined();
  });

  it('groups models under their own provider heading, stripping the provider prefix', () => {
    renderView(
      discovery({
        providers: [{ ...openRouterProvider, modelCount: 2 }],
        models: [
          { key: 'conn-1:gpt-4o-mini', label: 'OpenRouter — gpt-4o-mini' },
          { key: 'conn-1:gpt-4o', label: 'OpenRouter — gpt-4o' },
        ],
      }),
    );
    expect(screen.getByText('OpenRouter')).toBeDefined();
    expect(screen.getByText('gpt-4o-mini')).toBeDefined();
    expect(screen.getByText('gpt-4o')).toBeDefined();
  });

  it('shows an error-status badge and an empty note for an unreachable provider', () => {
    renderView(
      discovery({
        providers: [
          {
            id: 'conn-bad',
            label: 'Broken',
            baseUrl: 'https://bad.example.com',
            ok: false,
            message: 'This provider is unreachable.',
            modelCount: 0,
          },
        ],
        models: [],
      }),
    );
    expect(screen.getByText('This provider is unreachable.')).toBeDefined();
    expect(screen.getByText('No models currently reachable.')).toBeDefined();
  });

  it('renders a Local model group when the local engine is available', () => {
    renderView(
      discovery({
        local: { available: true, message: null },
        models: [{ key: 'local', label: 'Local model (this server)' }],
      }),
    );
    expect(screen.getByText('Local model')).toBeDefined();
    expect(screen.getByText('Local model (this server)')).toBeDefined();
  });

  it('a provider model with no override is unchecked (hidden by default)', () => {
    renderView(
      discovery({
        providers: [openRouterProvider],
        models: [{ key: 'conn-1:gpt-4o', label: 'OpenRouter — gpt-4o' }],
      }),
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('a provider model with a visibility override is checked', () => {
    renderView(
      discovery({
        providers: [openRouterProvider],
        models: [{ key: 'conn-1:gpt-4o', label: 'OpenRouter — gpt-4o' }],
      }),
      ['conn-1:gpt-4o'],
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('the local model with no override is checked (visible by default)', () => {
    renderView(
      discovery({
        local: { available: true, message: null },
        models: [{ key: 'local', label: 'Local model (this server)' }],
      }),
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('the local model with a visibility override is unchecked', () => {
    renderView(
      discovery({
        local: { available: true, message: null },
        models: [{ key: 'local', label: 'Local model (this server)' }],
      }),
      ['local'],
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });
});

describe('ModelsView — search', () => {
  function renderMultiProvider() {
    return renderView(
      discovery({
        local: { available: true, message: null },
        providers: [
          { ...openRouterProvider, modelCount: 2 },
          {
            id: 'conn-2',
            label: 'Home server',
            baseUrl: 'https://home.example.com/v1',
            ok: true,
            message: null,
            modelCount: 1,
          },
        ],
        models: [
          { key: 'local', label: 'Local model (this server)' },
          { key: 'conn-1:gpt-4o-mini', label: 'OpenRouter — gpt-4o-mini' },
          { key: 'conn-1:gpt-4o', label: 'OpenRouter — gpt-4o' },
          { key: 'conn-2:llama-3', label: 'Home server — llama-3' },
        ],
      }),
    );
  }

  it('shows every model and the correct total count with no query', () => {
    renderMultiProvider();
    expect(screen.getByText('4 of 4')).toBeDefined();
    expect(screen.getByText('gpt-4o-mini')).toBeDefined();
    expect(screen.getByText('gpt-4o')).toBeDefined();
    expect(screen.getByText('llama-3')).toBeDefined();
    expect(screen.getByText('Local model (this server)')).toBeDefined();
  });

  it('filters to models whose own name matches, hiding the rest', () => {
    renderMultiProvider();
    fireEvent.change(screen.getByPlaceholderText('Search models…'), {
      target: { value: 'llama' },
    });

    expect(screen.getByText('1 of 4')).toBeDefined();
    expect(screen.getByText('llama-3')).toBeDefined();
    expect(screen.queryByText('gpt-4o-mini')).toBeNull();
    expect(screen.queryByText('gpt-4o')).toBeNull();
    expect(screen.queryByText('Local model (this server)')).toBeNull();
  });

  it('a query matching a provider name surfaces every model in that group', () => {
    renderMultiProvider();
    fireEvent.change(screen.getByPlaceholderText('Search models…'), {
      target: { value: 'openrouter' },
    });

    expect(screen.getByText('2 of 4')).toBeDefined();
    expect(screen.getByText('gpt-4o-mini')).toBeDefined();
    expect(screen.getByText('gpt-4o')).toBeDefined();
    expect(screen.queryByText('llama-3')).toBeNull();
  });

  it('shows a "no models match" empty state when nothing matches', () => {
    renderMultiProvider();
    fireEvent.change(screen.getByPlaceholderText('Search models…'), {
      target: { value: 'nonexistent-model-xyz' },
    });

    expect(screen.getByText('No models match "nonexistent-model-xyz"')).toBeDefined();
    expect(screen.queryByText('gpt-4o')).toBeNull();
  });

  it('is case-insensitive', () => {
    renderMultiProvider();
    fireEvent.change(screen.getByPlaceholderText('Search models…'), {
      target: { value: 'LLAMA' },
    });
    expect(screen.getByText('llama-3')).toBeDefined();
  });
});
