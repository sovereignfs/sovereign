// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TwoFactorPanel } from '../TwoFactorPanel';

afterEach(cleanup);

describe('TwoFactorPanel', () => {
  it('asks for the password, shows the enrolment, and the codes once a code from the app is confirmed', async () => {
    const start = vi
      .fn()
      .mockResolvedValue({ uri: 'otpauth://totp/x?secret=ABCDEFGH', codes: ['one-two'] });
    const confirm = vi.fn().mockResolvedValue({});
    render(
      <TwoFactorPanel
        enabled={false}
        verified
        start={start}
        confirm={confirm}
        renderQr={(uri) => <p>QR {uri}</p>}
        onDone={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('QR otpauth://totp/x?secret=ABCDEFGH')).toBeTruthy();
    expect(start).toHaveBeenCalledWith('enable', 'secret');
    expect(screen.getByText('ABCD EFGH')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Code from the app/), { target: { value: ' 123456 ' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('one-two')).toBeTruthy();
    expect(confirm).toHaveBeenCalledWith('123456');
  });

  it('says why it cannot be turned on before the address is verified', () => {
    render(
      <TwoFactorPanel
        enabled={false}
        verified={false}
        start={vi.fn()}
        confirm={vi.fn()}
        renderQr={() => null}
        onDone={() => undefined}
      />,
    );
    expect(screen.getByText(/Verify your email address/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
  });
});
