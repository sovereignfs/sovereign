import type { Meta, StoryObj } from '@storybook/react-vite';
import { Message } from './Message';

const meta = {
  title: 'Components/Message',
  component: Message,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          "A single chat turn, for the Sovereign Harness assistant (RFC 0040). `sender` is one of user/assistant/tool — matching harness_messages (named `sender`, not `role`, to avoid colliding with the ARIA role attribute). Content is caller-controlled ReactNode; markdown rendering, if any, is the consumer's choice.",
      },
    },
  },
  args: { sender: 'assistant', children: 'Your task is due Thursday.' },
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------

export const User: Story = {
  args: { sender: 'user', children: 'What tasks do I have due this week?' },
};

export const Assistant: Story = {
  args: { sender: 'assistant' },
};

export const Tool: Story = {
  args: { sender: 'tool', children: 'query_tasks({ dueBefore: "2026-08-01" }) → 3 results' },
};

export const Pending: Story = {
  args: { sender: 'assistant', pending: true },
};

export const WithActions: Story = {
  args: {
    sender: 'assistant',
    actions: (
      <>
        <button type="button" style={{ all: 'unset', cursor: 'pointer' }}>
          Forget this
        </button>
        <span>·</span>
        <button type="button" style={{ all: 'unset', cursor: 'pointer' }}>
          Copy
        </button>
      </>
    ),
  },
};

export const Conversation: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Message sender="user">What tasks do I have due this week?</Message>
      <Message sender="tool">
        query_tasks({'{'} dueBefore: "2026-08-01" {'}'}) → 3 results
      </Message>
      <Message
        sender="assistant"
        actions={
          <button type="button" style={{ all: 'unset', cursor: 'pointer' }}>
            Forget this
          </button>
        }
      >
        You have 3 tasks due this week: review the Q3 report, reply to the design feedback thread,
        and renew the domain registration.
      </Message>
      <Message sender="user">Thanks!</Message>
      <Message sender="assistant" pending />
    </div>
  ),
};
