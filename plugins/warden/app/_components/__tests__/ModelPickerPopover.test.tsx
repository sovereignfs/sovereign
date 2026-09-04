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
    expect(within(dialog).getByRole('option', { name: 'gpt-4o-mini' })).toBeDefined();
    expect(within(dialog).getByRole('option', { name: 'gpt-4o' })).toBeDefined();
    expect(within(dialog).getByRole('option', { name: 'llama-3' })).toBeDefined();
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
    fireEvent.click(within(dialog).getByRole('option', { name: 'gpt-4o-mini' }));

    expect(onChange).toHaveBeenCalledWith('conn-1:gpt-4o-mini');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the placeholder inside the panel when there are no models at all', () => {
    renderPicker({ models: [], value: '' });
    openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(within(dialog).getByText('No model reachable')).toBeDefined();
  });

  it('links the footer to the Providers and Models destinations', () => {
    renderPicker();
    openPicker();
    const dialog = screen.getByRole('dialog', { name: 'Model' });
    expect(
      within(dialog).getByRole('link', { name: 'Manage providers' }).getAttribute('href'),
    ).toBe('/warden/providers');
    expect(within(dialog).getByRole('link', { name: 'Manage models' }).getAttribute('href')).toBe(
      '/warden/models',
    );
  });

  it('is disabled when told to be, regardless of model availability', () => {
    renderPicker({ disabled: true });
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });
});

/**
 * The inline `<select>` this popover replaced was keyboard- and
 * screen-reader-navigable for free. A stack of plain buttons in a
 * non-focus-trapping popover was not — no listbox semantics, no arrow keys,
 * no focus management, and focus dropped to `<body>` on selection.
 */
describe('ModelPickerPopover — keyboard and screen-reader support', () => {
  function listbox() {
    return screen.getByRole('listbox', { name: 'Model' });
  }

  it('marks the trigger as a listbox popup and reflects open state', () => {
    renderPicker();
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    openPicker();
    expect(screen.getByRole('button', { name: /Local model/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('exposes the chosen model via aria-selected, not colour alone', () => {
    renderPicker({ value: 'conn-1:gpt-4o' });
    openPicker();

    const selected = within(listbox()).getAllByRole('option', { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toBe('gpt-4o');
  });

  it('moves focus into the listbox on open, starting on the current selection', () => {
    renderPicker({ value: 'conn-2:llama-3' });
    openPicker();

    expect(document.activeElement).toBe(listbox());
    const active = document.getElementById(listbox().getAttribute('aria-activedescendant') ?? '');
    expect(active?.textContent).toBe('llama-3');
  });

  it('walks options with the arrow keys, across group boundaries, and wraps', () => {
    renderPicker({ value: 'local' }); // first option overall
    openPicker();
    const list = listbox();
    const activeText = () =>
      document.getElementById(list.getAttribute('aria-activedescendant') ?? '')?.textContent;

    expect(activeText()).toBe('Local model (this server)');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    // Crosses out of the "Local model" group into "OpenRouter".
    expect(activeText()).toBe('gpt-4o-mini');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(activeText()).toBe('Local model (this server)');
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(activeText()).toBe('llama-3'); // wrapped to the end
    fireEvent.keyDown(list, { key: 'Home' });
    expect(activeText()).toBe('Local model (this server)');
    fireEvent.keyDown(list, { key: 'End' });
    expect(activeText()).toBe('llama-3');
  });

  it('selects the active option with Enter and returns focus to the trigger', () => {
    const { onChange } = renderPicker({ value: 'local' });
    openPicker();
    const list = listbox();

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('conn-1:gpt-4o-mini');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });

  it('returns focus to the trigger when dismissed with Escape', () => {
    renderPicker();
    openPicker();

    fireEvent.keyDown(listbox(), { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });

  it('returns focus to the trigger after a click selection', () => {
    renderPicker();
    openPicker();

    fireEvent.click(within(listbox()).getByRole('option', { name: 'gpt-4o' }));

    expect(document.activeElement).toBe(screen.getByRole('button'));
  });
});
