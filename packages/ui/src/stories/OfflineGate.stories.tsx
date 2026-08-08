import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfflineGate } from '../components/OfflineGate/OfflineGate';
import { EmptyState } from '../components/EmptyState/EmptyState';

const sampleContent = (
  <div style={{ padding: 'var(--sv-space-4)' }}>
    <p style={{ margin: 0, fontFamily: 'var(--sv-font-family)' }}>
      The wrapped content — a user list, a settings form, anything that shouldn&rsquo;t operate
      against a stale cached snapshot.
    </p>
  </div>
);

const meta = {
  title: 'Components/OfflineGate',
  component: OfflineGate,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof OfflineGate>;

export default meta;
type Story = StoryObj<typeof meta>;

// `OfflineGate` reads the live `useIsOffline()` hook, which Storybook can't
// drive via args — toggle DevTools > Network > Offline (or throttling) in this
// preview to see it swap `children` for the blocked state below.
export const Default: Story = {
  args: { children: sampleContent, surfaceName: 'Console' },
};

// The offline state is not independently controllable here (same reason as
// Default), so this renders the exact EmptyState output OfflineGate produces
// when useIsOffline() is true, for visual review without a live toggle.
export const OfflineState: Story = {
  args: { children: sampleContent, surfaceName: 'Console' },
  render: () => (
    <EmptyState
      icon="alert-triangle"
      heading="You're offline"
      description="Console needs a connection — reconnect to continue."
    />
  ),
};
