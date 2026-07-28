// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Combobox, type ComboboxOption } from '../Combobox';

let mobile = false;
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      // useIsMobile's query is '(max-width: ...)'; Drawer's own
      // prefers-reduced-motion check defaults to false — see DatePicker's
      // identical test setup for why.
      matches: query.includes('max-width') ? mobile : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const options: ComboboxOption[] = [
  { value: 'tasks', label: 'sovereign-tasks' },
  { value: 'ledger', label: 'sovereign-ledger' },
  { value: 'shopper', label: 'sovereign-shopper' },
];

// Popover's width="trigger" mode observes the trigger's size via
// ResizeObserver, which jsdom does not implement.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('Combobox', () => {
  beforeEach(() => {
    mobile = false;
    installMatchMedia();
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('shows the placeholder when nothing is selected', () => {
    render(
      <Combobox
        options={options}
        value={null}
        onChange={() => {}}
        placeholder="Pick a plugin"
        aria-label="Plugin"
      />,
    );
    expect(screen.getByRole('button', { name: 'Plugin' }).textContent).toContain('Pick a plugin');
  });

  it('shows the selected option label', () => {
    render(<Combobox options={options} value="ledger" onChange={() => {}} aria-label="Plugin" />);
    expect(screen.getByRole('button', { name: 'Plugin' }).textContent).toContain(
      'sovereign-ledger',
    );
  });

  it('opens as a Popover on desktop', () => {
    render(<Combobox options={options} value={null} onChange={() => {}} aria-label="Plugin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    const panel = screen.getByRole('dialog', { name: 'Plugin' });
    expect(panel.getAttribute('aria-modal')).toBe('false');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('opens as a Drawer on mobile', () => {
    mobile = true;
    installMatchMedia();
    render(<Combobox options={options} value={null} onChange={() => {}} aria-label="Plugin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    const panel = screen.getByRole('dialog', { name: 'Plugin' });
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters options by label', () => {
    render(<Combobox options={options} value={null} onChange={() => {}} aria-label="Plugin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'led' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'sovereign-ledger' })).toBeDefined();
  });

  it('shows an empty message when nothing matches', () => {
    render(
      <Combobox
        options={options}
        value={null}
        onChange={() => {}}
        aria-label="Plugin"
        emptyMessage="No plugins"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No plugins')).toBeDefined();
  });

  it('marks the currently selected option with aria-selected', () => {
    render(<Combobox options={options} value="shopper" onChange={() => {}} aria-label="Plugin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    expect(
      screen.getByRole('option', { name: 'sovereign-shopper' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen.getByRole('option', { name: 'sovereign-tasks' }).getAttribute('aria-selected'),
    ).toBe('false');
  });

  it('clicking an option calls onChange with its value and closes', () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value={null} onChange={onChange} aria-label="Plugin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    fireEvent.click(screen.getByRole('option', { name: 'sovereign-ledger' }));
    expect(onChange).toHaveBeenCalledWith('ledger');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Enter selects the highlighted option', () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value={null} onChange={onChange} aria-label="Plugin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('tasks');
  });

  it('ArrowDown moves the highlighted option before Enter selects it', () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value={null} onChange={onChange} aria-label="Plugin" />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugin' }));
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('ledger');
  });

  it('disables the trigger when disabled', () => {
    render(
      <Combobox options={options} value={null} onChange={() => {}} aria-label="Plugin" disabled />,
    );
    expect((screen.getByRole('button', { name: 'Plugin' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
