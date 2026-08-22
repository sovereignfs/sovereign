// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotificationsPanel } from '../NotificationsPanel';

afterEach(() => {
  cleanup();
});

const items = [
  {
    id: '1',
    icon: <span>icon</span>,
    title: 'Added to a project',
    timeLabel: '2d ago',
    read: false,
    onOpen: vi.fn(),
    onDismiss: vi.fn(),
  },
];

describe('NotificationsPanel', () => {
  it('renders a closed trigger with an unread badge', () => {
    render(<NotificationsPanel items={items} unreadCount={1} />);
    expect(screen.getByRole('button', { name: /1 unread/ })).toBeTruthy();
    expect(screen.queryByText('Added to a project')).toBeNull();
  });

  it('renders no badge when there are no unread notifications', () => {
    render(<NotificationsPanel items={[]} unreadCount={0} />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('opens the panel on trigger click, showing items', () => {
    render(<NotificationsPanel items={items} unreadCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: /unread/ }));
    expect(screen.getByText('Added to a project')).toBeTruthy();
    expect(screen.getByText('2d ago')).toBeTruthy();
  });

  it('shows an empty state when there are no items', () => {
    render(<NotificationsPanel items={[]} unreadCount={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('No notifications.')).toBeTruthy();
  });

  it('calls onOpen when an unread title is clicked', () => {
    render(<NotificationsPanel items={items} unreadCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: /unread/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read: Added to a project' }));
    expect(items[0]?.onOpen).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    render(<NotificationsPanel items={items} unreadCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: /unread/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Added to a project' }));
    expect(items[0]?.onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onMarkAllRead and onClearAll from the header actions', () => {
    const onMarkAllRead = vi.fn();
    const onClearAll = vi.fn();
    render(
      <NotificationsPanel
        items={items}
        unreadCount={1}
        onMarkAllRead={onMarkAllRead}
        onClearAll={onClearAll}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /unread/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
