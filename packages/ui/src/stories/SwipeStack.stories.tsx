import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SwipeStack } from '../components/SwipeStack/SwipeStack';
import { SwipeStackCard } from '../components/SwipeStack/SwipeStackCard';

const AGENDA_TASKS = [
  { id: 'water-plants', title: 'Water the plants', detail: 'Living room + balcony' },
  { id: 'standup', title: 'Team standup', detail: '9:30am · 15 min' },
  { id: 'groceries', title: 'Buy groceries', detail: 'Milk, eggs, bread' },
  { id: 'review-pr', title: "Review teammate's PR", detail: 'sovereign/sovereign #482' },
  { id: 'call-dentist', title: 'Call the dentist', detail: 'Reschedule cleaning' },
];

function taskCardStyle(): React.CSSProperties {
  return {
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: 'var(--sv-space-6)',
    fontFamily: 'var(--sv-font-family)',
  };
}

function TaskCardDemo({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={taskCardStyle()}>
      <div
        style={{
          fontSize: 'var(--sv-font-size-lg)',
          fontWeight: 'var(--sv-font-weight-semibold)',
          color: 'var(--sv-color-text-primary)',
          marginBottom: 'var(--sv-space-2)',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 'var(--sv-font-size-sm)', color: 'var(--sv-color-text-muted)' }}>
        {detail}
      </div>
    </div>
  );
}

function StackFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: 420,
        maxWidth: 375,
        margin: '0 auto',
        padding: 'var(--sv-space-4)',
        border: '1px solid var(--sv-color-border)',
        borderRadius: 'var(--sv-radius-md)',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

function AgendaDemo() {
  const [log, setLog] = useState<string[]>([]);
  return (
    <StackFrame>
      <SwipeStack
        aria-label="Today's agenda"
        directions={{
          up: { label: 'Done', icon: 'check' },
          down: { label: 'Defer', icon: 'history' },
          right: { label: 'Skip', icon: 'chevron-right' },
        }}
        onSwipe={(direction, cardId) =>
          setLog((l) => [`${cardId} → ${direction}`, ...l].slice(0, 5))
        }
      >
        {AGENDA_TASKS.map((task) => (
          <SwipeStackCard key={task.id} cardId={task.id}>
            <TaskCardDemo title={task.title} detail={task.detail} />
          </SwipeStackCard>
        ))}
      </SwipeStack>
      <div
        style={{
          marginTop: 'var(--sv-space-3)',
          fontFamily: 'var(--sv-font-family)',
          fontSize: 'var(--sv-font-size-xs)',
          color: 'var(--sv-color-text-muted)',
        }}
      >
        {log.map((entry, i) => (
          <div key={i}>{entry}</div>
        ))}
      </div>
    </StackFrame>
  );
}

function TwoDirectionsDemo() {
  return (
    <StackFrame>
      <SwipeStack
        aria-label="Photo picker"
        directions={{
          left: { label: 'Skip' },
          right: { label: 'Keep', icon: 'check' },
        }}
        onSwipe={() => {}}
      >
        {AGENDA_TASKS.map((task) => (
          <SwipeStackCard key={task.id} cardId={task.id}>
            <TaskCardDemo title={task.title} detail={task.detail} />
          </SwipeStackCard>
        ))}
      </SwipeStack>
    </StackFrame>
  );
}

function EmptyDemo() {
  return (
    <StackFrame>
      <SwipeStack
        aria-label="Today's agenda"
        directions={{ up: { label: 'Done', icon: 'check' } }}
        onSwipe={() => {}}
      >
        {[]}
      </SwipeStack>
    </StackFrame>
  );
}

const meta = {
  title: 'Components/SwipeStack',
  component: SwipeStack,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A compound component for triaging one card at a time by dragging it left/right/up/down, plus an always-visible non-gesture fallback (a button per configured direction) wired to the identical commit path and exit animation as a real drag. Every direction is independently optional and has no baked-in meaning — the caller supplies label/icon per direction and reacts to onSwipe; once triggered, a direction always removes the card for good, there is no reversible "go back".',
      },
    },
  },
  // Every story below supplies its own render(), stateless or with its own
  // useState — these args only satisfy the required-prop typing.
  args: {
    'aria-label': "Today's agenda",
    directions: {},
    onSwipe: () => {},
    children: null,
  },
} satisfies Meta<typeof SwipeStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <AgendaDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'up/down/right configured, left intentionally omitted — SwipeStack does not require all 4 directions. The log below the stack shows onSwipe firing with (direction, cardId) for both a drag and a fallback-button click.',
      },
    },
  },
};

export const TwoDirections: Story = {
  render: () => <TwoDirectionsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Only left/right configured — up/down are a wall, not just an unreachable outcome, so the card never visually drifts vertically, and touch-action stays pan-y so a page can still scroll vertically through the stack.',
      },
    },
  },
};

export const Empty: Story = {
  render: () => <EmptyDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'No cards left — SwipeStack renders its empty region and disables the fallback button rather than showing any built-in empty-state copy; that vocabulary belongs to the caller, same as SwipableMobileCarousel has no opinion on where slide data lives.',
      },
    },
  },
};

export const MobileViewport: Story = {
  render: () => <AgendaDemo />,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
