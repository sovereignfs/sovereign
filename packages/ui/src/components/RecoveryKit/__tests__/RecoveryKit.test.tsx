// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RecoveryKit, recoveryKitFileName, recoveryKitFileText } from '../RecoveryKit';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const KIT = '000G-40R4-0M30-E209-185G-R38E-1W81-24GK-2GAH-C5RR-34D1-P70X-3RFG-K7Q2';

describe('RecoveryKit', () => {
  it('shows the kit as fourteen groups, each read out character by character', () => {
    render(<RecoveryKit kit={KIT} instanceName="Rohr" onContinue={() => {}} />);
    const list = screen.getByRole('list', { name: 'Your recovery kit, in groups of four' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(14);
    expect(items[0]?.textContent).toBe('000G');
    expect(items[0]?.getAttribute('aria-label')).toBe('0 0 0 G');
    expect(items[13]?.textContent).toBe('K7Q2');
  });

  it('holds Continue off until the box is ticked, and the box is not ticked to begin with', () => {
    const onContinue = vi.fn();
    render(<RecoveryKit kit={KIT} instanceName="Rohr" onContinue={onContinue} />);
    const button = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    const box = screen.getByRole('checkbox', {
      name: "I've kept my recovery kit somewhere safe",
    }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.click(box);
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('says it is continuing, and cannot be pressed again meanwhile', () => {
    render(<RecoveryKit kit={KIT} instanceName="Rohr" onContinue={() => {}} continuing />);
    fireEvent.click(screen.getByRole('checkbox'));
    const button = screen.getByRole('button', { name: /Continuing/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('prints the page, which its print stylesheet narrows to the kit', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<RecoveryKit kit={KIT} instanceName="Rohr" onContinue={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('saves a text file named for the instance, made only when asked', () => {
    const create = vi.fn(() => 'blob:kit');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<RecoveryKit kit={KIT} instanceName="Rohr Family" onContinue={() => {}} />);
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save as a file' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'rohr-family-recovery-kit.txt',
    );
    expect(revoke).toHaveBeenCalledWith('blob:kit');
  });

  it('writes the file with the kit and what it is for', () => {
    const text = recoveryKitFileText(KIT, 'Rohr');
    expect(text).toContain('Recovery kit for Rohr');
    expect(text).toContain(KIT);
    expect(text).toContain('the only way back to your encrypted data');
    expect(recoveryKitFileName('  ')).toBe('sovereign-recovery-kit.txt');
  });
});
