// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeviceOnlyGate } from '../DeviceOnlyGate';

describe('DeviceOnlyGate', () => {
  afterEach(cleanup);

  it('renders children unchanged when available', () => {
    render(
      <DeviceOnlyGate available={true}>
        <p>Wallet content</p>
      </DeviceOnlyGate>,
    );
    expect(screen.getByText('Wallet content')).toBeDefined();
  });

  it('replaces children with an explanatory empty state when unavailable', () => {
    render(
      <DeviceOnlyGate available={false}>
        <p>Wallet content</p>
      </DeviceOnlyGate>,
    );
    expect(screen.queryByText('Wallet content')).toBeNull();
    expect(screen.getByText('Phone only')).toBeDefined();
  });

  it('names the surface in the message when provided', () => {
    render(
      <DeviceOnlyGate available={false} surfaceName="Wallet">
        <p>Wallet content</p>
      </DeviceOnlyGate>,
    );
    expect(screen.getByText(/Wallet is only available on a phone/)).toBeDefined();
  });

  it('falls back to generic phrasing with no surface name', () => {
    render(
      <DeviceOnlyGate available={false}>
        <p>Wallet content</p>
      </DeviceOnlyGate>,
    );
    expect(screen.getByText(/This app is only available on a phone/)).toBeDefined();
  });
});
