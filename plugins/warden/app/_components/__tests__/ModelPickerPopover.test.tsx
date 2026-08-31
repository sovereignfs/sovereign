// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModelPickerPopover } from '../ModelPickerPopover';

afterEach(cleanup);

const models = [
  { key: 'local', label: 'Local model (this server)' },
  { key: 'conn-1:gpt-4o-mini', label: 'OpenRouter — gpt-4o-mini' },
  { key: 'conn-1:gpt-4o', label: 'OpenRouter — gpt-4o' },
  { key: 'conn-2:llama-3', label: 'Home server — llama-3' },
];

const providers = [
  { id: 'conn-1', label: 'OpenRouter' },
  { id: 'conn-2', label: 'Home server' },
];

function renderPicker(overrides: Partial<Parameters<typeof ModelPickerPopover>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <ModelPickerPopover
      models={models}
      providers={providers}
      value="local"
      onChange={onChange}
      placeholder="No model reachable"
      {...overrides}
    />,
  );
  return { ...utils, onChange };
}

function openPicker() {
  fireEvent.click(screen.getByRole('button'));
}

describe('ModelPickerPopover', () => {
  it('shows the selected model as the trigger label', () => {
    renderPicker({ value: 'conn-1:gpt-4o-mini' });
    expect(screen.getByRole('button', { name: 'gpt-4o-mini' })).toBeDefined();
  });

  it('shows the placeholder when nothing is selected', () => {
    renderPicker({ value: '', models: [] });
    expect(screen.getByRole('button', { name: 'No model reachable' })).toBeDefined();
  });

  it('is closed until the trigger is clicked', () => {
    renderPicker();
    expect(screen.queryByRole('dialog')).toBeNull();
    openPicker();
    expect(screen.getByRole('dialog', { name: 'Model' })).toBeDefined();
  });

  it('groups models by provider, local first, stripping the provider prefix from each key', () => {
    renderPicker();
    openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(within(dialog).getByText('Local model')).toBeDefined();
    expect(within(dialog).getByText('OpenRouter')).toBeDefined();
    expect(within(dialog).getByText('Home server')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'gpt-4o-mini' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'gpt-4o' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'llama-3' })).toBeDefined();
  });

  it('omits a provider group entirely when it has no visible models', () => {
    renderPicker({
      models: [{ key: 'local', label: 'Local model (this server)' }],
    });
    openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(within(dialog).queryByText('OpenRouter')).toBeNull();
    expect(within(dialog).queryByText('Home server')).toBeNull();
  });

  it('calls onChange and closes when a model is selected', () => {
    const { onChange } = renderPicker();
    openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'gpt-4o-mini' }));

    expect(onChange).toHaveBeenCalledWith('conn-1:gpt-4o-mini');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the placeholder inside the panel when there are no models at all', () => {
    renderPicker({ models: [], value: '' });
    openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(within(dialog).getByText('No model reachable')).toBeDefined();
  });

  it('links the footer into Settings → Providers and Settings → Models', () => {
    renderPicker();
    openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(
      within(dialog).getByRole('link', { name: 'Manage providers' }).getAttribute('href'),
    ).toBe('/warden/settings?tab=providers');
    expect(within(dialog).getByRole('link', { name: 'Manage models' }).getAttribute('href')).toBe(
      '/warden/settings?tab=models',
    );
  });

  it('is disabled when told to be, regardless of model availability', () => {
    renderPicker({ disabled: true });
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });
});
