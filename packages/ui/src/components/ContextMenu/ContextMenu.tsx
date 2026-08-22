'use client';

import { cloneElement, useState } from 'react';
import type { ReactElement } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useIsMobile, useLongPress } from '../../hooks';
import { Popover } from '../Popover/Popover';
import { Drawer } from '../Drawer/Drawer';
import { MenuEntries, type MenuEntry, type MenuItem } from '../Menu/Menu';

export interface ContextMenuProps {
  /** The element that gets right-click (desktop) / long-press (touch)
   * behavior — cloned with the trigger handlers, rendered as-is otherwise.
   * Typed with `<any>` props (not a bare `ReactElement`, whose implicit
   * `unknown` props type makes `cloneElement` reject *both* branches of
   * the long-press/onContextMenu union below — an interface value like
   * `LongPressHandlers` isn't assignable to an indexed props type without
   * its own index signature) — the standard, narrowly-scoped escape hatch
   * for "clone an arbitrary child with props not known ahead of time". */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
  children: ReactElement<any>;
  items: MenuEntry[];
  'aria-label': string;
}

/**
 * ContextMenu — right-click menu on desktop, long-press on touch.
 *
 * Desktop positioning reuses `Popover`'s existing collision-detection logic
 * rather than reimplementing it: the panel is wrapped in a zero-size,
 * `position: fixed` anchor placed at the click coordinates, so `Popover`
 * measures and flips against *that* point exactly as it would a normal
 * trigger element.
 *
 * Touch uses `useLongPress` (which already handles the OS's own long-press
 * callout/context-menu suppression) and opens the same items in a `Drawer`
 * bottom sheet — the same adaptive-surface split `Menu` already uses,
 * because a floating panel positioned at a touch point isn't a pattern
 * touch interfaces have in the first place.
 */
export function ContextMenu({ children, items, 'aria-label': ariaLabel }: ContextMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ x: 0, y: 0 });

  const longPressHandlers = useLongPress({
    onLongPress: () => setOpen(true),
    disabled: !isMobile,
  });

  function handleContextMenu(e: ReactMouseEvent) {
    e.preventDefault();
    setPoint({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }

  const wrappedChild = cloneElement(
    children,
    isMobile ? longPressHandlers : { onContextMenu: handleContextMenu },
  );

  const list = (
    <MenuEntries
      items={items}
      onSelect={(entry: MenuItem) => {
        setOpen(false);
        entry.onSelect?.();
      }}
    />
  );

  if (isMobile) {
    return (
      <>
        {wrappedChild}
        <Drawer open={open} onClose={() => setOpen(false)} aria-label={ariaLabel}>
          {list}
        </Drawer>
      </>
    );
  }

  return (
    <>
      {wrappedChild}
      {open && (
        <div style={{ position: 'fixed', left: point.x, top: point.y, width: 0, height: 0 }}>
          <Popover
            trigger={<span />}
            open={open}
            onClose={() => setOpen(false)}
            aria-label={ariaLabel}
          >
            {list}
          </Popover>
        </div>
      )}
    </>
  );
}
