import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MessageScroller } from './MessageScroller';
import { Message } from '../Message/Message';
import { Button } from '../Button/Button';

const meta = {
  title: 'Components/MessageScroller',
  component: MessageScroller,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Auto-scrolling chat container. Scrolls to the newest message while the user is near the bottom; if they\'ve scrolled up, new content shows a "New messages" button instead of yanking them back down.',
      },
    },
  },
  args: { children: null },
} satisfies Meta<typeof MessageScroller>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

const SEED_MESSAGES = [
  { sender: 'user' as const, text: 'What tasks do I have due this week?' },
  {
    sender: 'assistant' as const,
    text: 'You have 3 tasks due this week: review the Q3 report, reply to the design feedback thread, and renew the domain registration.',
  },
  { sender: 'user' as const, text: 'Can you summarize the Q3 report task?' },
  {
    sender: 'assistant' as const,
    text: 'It\'s tagged "high priority" and due Thursday — created from your Notes plugin two days ago.',
  },
];

export const Interactive: Story = {
  render: () => {
    const [messages, setMessages] = useState(SEED_MESSAGES);
    return (
      <div style={{ height: 420, display: 'flex', flexDirection: 'column', maxWidth: 480 }}>
        <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--sv-color-border)' }}>
          <MessageScroller>
            {messages.map((m, i) => (
              <Message key={i} sender={m.sender}>
                {m.text}
              </Message>
            ))}
          </MessageScroller>
        </div>
        <div style={{ padding: 'var(--sv-space-3)' }}>
          <Button
            size="sm"
            onClick={() =>
              setMessages((prev) => [
                ...prev,
                { sender: 'assistant', text: `New message #${prev.length + 1}` },
              ])
            }
          >
            Add message
          </Button>
        </div>
      </div>
    );
  },
};

export const LongHistory: Story = {
  render: () => (
    <div style={{ height: 420, maxWidth: 480, border: '1px solid var(--sv-color-border)' }}>
      <MessageScroller>
        {Array.from({ length: 30 }, (_, i) => (
          <Message key={i} sender={i % 2 === 0 ? 'user' : 'assistant'}>
            Message {i + 1}
          </Message>
        ))}
      </MessageScroller>
    </div>
  ),
};
