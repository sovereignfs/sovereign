// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Message } from '../Message';

afterEach(cleanup);

describe('Message', () => {
  it('renders children content', () => {
    render(<Message sender="user">Hello there</Message>);
    expect(screen.getByText('Hello there')).toBeDefined();
  });

  it('shows a "Thinking" indicator instead of children when pending', () => {
    render(
      <Message sender="assistant" pending>
        Not shown yet
      </Message>,
    );
    expect(screen.getByLabelText('Thinking')).toBeDefined();
    expect(screen.queryByText('Not shown yet')).toBeNull();
  });

  it('renders actions below the bubble when given and not pending', () => {
    render(
      <Message sender="assistant" actions={<button type="button">Forget this</button>}>
        Your task is due Thursday.
      </Message>,
    );
    expect(screen.getByRole('button', { name: 'Forget this' })).toBeDefined();
  });

  it('hides actions while pending', () => {
    render(
      <Message sender="assistant" pending actions={<button type="button">Forget this</button>}>
        content
      </Message>,
    );
    expect(screen.queryByRole('button', { name: 'Forget this' })).toBeNull();
  });

  it.each(['user', 'assistant', 'tool'] as const)('renders the %s sender', (sender) => {
    render(<Message sender={sender}>content</Message>);
    expect(screen.getByText('content')).toBeDefined();
  });
});
