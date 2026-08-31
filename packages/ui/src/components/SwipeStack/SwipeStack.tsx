'use client';

import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button } from '../Button/Button';
import { Icon, type IconName } from '../Icon/Icon';
import { useSwipeStack, SWIPE_STACK_TRANSITION_MS } from '../../hooks/useSwipeStack';
import type { SwipeDirection } from '../../hooks/useSwipeStack';
import { SwipeStackCard } from './SwipeStackCard';
import styles from './SwipeStack.module.css';

export interface SwipeDirectionMeta {
  /** Visible text on the fallback button and the in-drag stamp. */
  label: string;
  icon?: IconName;
}

export interface SwipeStackProps {
  /** Required — labels the swipeable region for assistive tech. No generic
   *  fallback, since one would be wrong for every actual consumer. */
  'aria-label': string;
  /** Which of the 4 directions are live, and what each is called. A
   *  direction absent here cannot be dragged toward at all (useSwipeStack
   *  treats it as a wall) and gets no fallback button or stamp. SwipeStack
   *  itself has no opinion on what a direction *means* — that vocabulary
   *  belongs entirely to the caller. */
  directions: Partial<Record<SwipeDirection, SwipeDirectionMeta>>;
  /** Fires once a drag (or a fallback button) commits to a direction. Every
   *  configured direction behaves the same way: the card leaves for good —
   *  there is no reversible "go back" state. SwipeStack has no opinion on
   *  where card data lives; the caller is responsible for eventually no
   *  longer including this cardId in children (e.g. once a mutation lands). */
  onSwipe: (direction: SwipeDirection, cardId: string) => void;
  /** Effective drag distance (px) required to commit. Passed straight
   *  through to useSwipeStack. */
  threshold?: number;
  className?: string;
  /** Must be SwipeStackCard elements (nullish/boolean children are safely
   *  skipped for conditional cards). A dev-mode warning is logged for any
   *  other child type — see resolveCards below. */
  children: ReactNode;
}

interface ResolvedCard {
  key: string;
  element: ReactElement;
}

const DIRECTION_KEYS: readonly SwipeDirection[] = ['up', 'down', 'left', 'right'];

const STAMP_CLASS: Record<SwipeDirection, string> = {
  up: styles.stampUp as string,
  down: styles.stampDown as string,
  left: styles.stampLeft as string,
  right: styles.stampRight as string,
};

function describeChild(child: unknown): string {
  if (isValidElement(child)) {
    const type = child.type;
    if (typeof type === 'string') return `<${type}>`;
    if (typeof type === 'function') {
      const named = type as { displayName?: string; name?: string };
      return `<${named.displayName ?? named.name ?? 'Component'}>`;
    }
    return '<unknown>';
  }
  if (typeof child === 'string') return `string "${child}"`;
  return String(child);
}

function resolveCards(children: ReactNode): ResolvedCard[] {
  const cards: ResolvedCard[] = [];
  Children.forEach(children, (child, index) => {
    if (child === null || child === undefined || child === false || child === true) return;
    if (!isValidElement(child) || child.type !== SwipeStackCard) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          '[SwipeStack] Every child must be a <SwipeStackCard>. ' +
            `Found ${describeChild(child)} at position ${index}.`,
        );
      }
      return;
    }
    const cardProps = child.props as { cardId: string };
    cards.push({ key: cardProps.cardId, element: child });
  });
  return cards;
}

/**
 * SwipeStack — a compound component for triaging one card at a time by
 * dragging it left/right/up/down (wrapping useSwipeStack), plus an
 * always-visible non-gesture fallback: a button per configured direction,
 * wired to the identical commit path and exit animation as a real drag.
 *
 * Every direction is independently optional and behaves the same way once
 * triggered — the card leaves for good, there is no reversible "go back".
 * SwipeStack owns rendering, drag physics, and the stamp/fallback UI only;
 * it has no opinion on where card data lives or what a direction means —
 * see SwipeStackProps.onSwipe.
 */
export function SwipeStack({
  'aria-label': ariaLabel,
  directions,
  onSwipe,
  threshold,
  className,
  children,
}: SwipeStackProps) {
  const cards = resolveCards(children);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [exiting, setExiting] = useState<ResolvedCard | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    },
    [],
  );

  const available = cards.filter((c) => !dismissed.has(c.key));
  const nextUp = available[0];
  const current = exiting ?? nextUp ?? null;
  const peek = exiting ? nextUp : available[1];

  const liveDirections = DIRECTION_KEYS.filter((d) => directions[d]);

  const { cardRef, wrapRef, handlers, touchAction, triggerCommit } = useSwipeStack({
    directions: liveDirections,
    threshold,
    disabled: !!exiting || !nextUp,
    onCommit(direction) {
      const committed = current;
      if (!committed) return;
      setDismissed((prev) => new Set(prev).add(committed.key));
      setExiting(committed);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => {
        setExiting((prev) => (prev?.key === committed.key ? null : prev));
      }, SWIPE_STACK_TRANSITION_MS);
      onSwipe(direction, committed.key);
    },
  });

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <div className={styles.stack} role="region" aria-label={ariaLabel}>
        {peek && (
          <div className={styles.peek} key={peek.key} aria-hidden="true">
            {peek.element}
          </div>
        )}
        {current && (
          <div className={styles.cardSlot} key={current.key} ref={wrapRef}>
            {liveDirections.map((d) => {
              const meta = directions[d];
              if (!meta) return null;
              return (
                <div
                  key={d}
                  className={[styles.stamp, STAMP_CLASS[d]].join(' ')}
                  aria-hidden="true"
                >
                  {meta.icon && <Icon name={meta.icon} size="sm" aria-hidden />}
                  <span>{meta.label}</span>
                </div>
              );
            })}
            <div className={styles.card} ref={cardRef} style={{ touchAction }} {...handlers}>
              {current.element}
            </div>
          </div>
        )}
      </div>
      {liveDirections.length > 0 && (
        <div className={styles.actions} role="group" aria-label={`${ariaLabel} actions`}>
          {liveDirections.map((d) => {
            const meta = directions[d];
            if (!meta) return null;
            return (
              <Button
                key={d}
                variant="secondary"
                size="sm"
                disabled={!current}
                onClick={() => triggerCommit(d)}
              >
                {meta.icon && <Icon name={meta.icon} size="sm" aria-hidden />}
                {meta.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
