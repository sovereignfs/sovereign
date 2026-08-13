// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeviceStorageKeyGate } from '../DeviceStorageKeyGate';

describe('DeviceStorageKeyGate', () => {
  afterEach(cleanup);

  it('renders nothing while checking', () => {
    const { container } = render(
      <DeviceStorageKeyGate status="checking">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders children unchanged once set up', () => {
    render(
      <DeviceStorageKeyGate status="set-up">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.getByText('Notes content')).toBeDefined();
  });

  it('shows a "Phone only"-style message when the environment is unsupported', () => {
    render(
      <DeviceStorageKeyGate status="unsupported">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.queryByText('Notes content')).toBeNull();
    expect(screen.getByText('Phone only')).toBeDefined();
  });

  it('shows the setup message and prompt when not-set-up', () => {
    render(
      <DeviceStorageKeyGate status="not-set-up">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.queryByText('Notes content')).toBeNull();
    expect(screen.getByText('Set up your Device Storage Key')).toBeDefined();
  });

  it('names the surface in the not-set-up message when provided', () => {
    render(
      <DeviceStorageKeyGate status="not-set-up" surfaceName="Notes">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.getByText(/Notes keeps its data only on this device/)).toBeDefined();
  });

  it('falls back to generic phrasing with no surface name', () => {
    render(
      <DeviceStorageKeyGate status="not-set-up">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.getByText(/This app keeps its data only on this device/)).toBeDefined();
  });

  it('renders the caller-supplied setupAction when not-set-up', () => {
    render(
      <DeviceStorageKeyGate
        status="not-set-up"
        setupAction={<a href="/account/security">Go to Account → Security</a>}
      >
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.getByRole('link', { name: 'Go to Account → Security' })).toBeDefined();
  });

  it('renders no setupAction when unsupported, even if one is passed', () => {
    render(
      <DeviceStorageKeyGate
        status="unsupported"
        setupAction={<a href="/account/security">Go to Account → Security</a>}
      >
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the hard-block message when no-device-auth', () => {
    render(
      <DeviceStorageKeyGate status="no-device-auth">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.queryByText('Notes content')).toBeNull();
    expect(screen.getByText('Set up a device passcode')).toBeDefined();
  });

  it('names the surface in the no-device-auth message when provided', () => {
    render(
      <DeviceStorageKeyGate status="no-device-auth" surfaceName="Notes">
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.getByText(/Notes needs a passcode, fingerprint, or face unlock/)).toBeDefined();
  });

  it('renders no setupAction when no-device-auth, even if one is passed — fixing this is a device settings change, not a Sovereign link', () => {
    render(
      <DeviceStorageKeyGate
        status="no-device-auth"
        setupAction={<a href="/account/security">Go to Account → Security</a>}
      >
        <p>Notes content</p>
      </DeviceStorageKeyGate>,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});
