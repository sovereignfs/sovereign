// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Alert } from '../Alert';

afterEach(cleanup);

describe('Alert', () => {
  it('uses role="alert" for the error variant', () => {
    render(<Alert variant="error">Something went wrong.</Alert>);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it.each(['info', 'success', 'warning', 'neutral'] as const)(
    'uses role="status" for the %s variant',
    (variant) => {
      render(<Alert variant={variant}>Message</Alert>);
      expect(screen.getByRole('status')).toBeDefined();
    },
  );

  it('renders a heading when given one', () => {
    render(
      <Alert variant="warning" heading="Heads up">
        Body text.
      </Alert>,
    );
    expect(screen.getByText('Heads up')).toBeDefined();
    expect(screen.getByText('Body text.')).toBeDefined();
  });

  it('renders without a heading', () => {
    render(<Alert variant="info">Just the body.</Alert>);
    expect(screen.getByText('Just the body.')).toBeDefined();
  });

  it('renders a default icon for info, success, warning, and error, but none for neutral', () => {
    const info = render(<Alert variant="info">Message</Alert>);
    expect(info.container.querySelector('svg')).not.toBeNull();
    info.unmount();

    const success = render(<Alert variant="success">Message</Alert>);
    expect(success.container.querySelector('svg')).not.toBeNull();
    success.unmount();

    const warning = render(<Alert variant="warning">Message</Alert>);
    expect(warning.container.querySelector('svg')).not.toBeNull();
    warning.unmount();

    const error = render(<Alert variant="error">Message</Alert>);
    expect(error.container.querySelector('svg')).not.toBeNull();
    error.unmount();

    const neutral = render(<Alert variant="neutral">Message</Alert>);
    expect(neutral.container.querySelector('svg')).toBeNull();
  });

  it('suppresses the default icon when icon={false}', () => {
    const { container } = render(
      <Alert variant="success" icon={false}>
        Message
      </Alert>,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('overrides the default icon when icon is set explicitly', () => {
    const { container } = render(
      <Alert variant="neutral" icon="info">
        Message
      </Alert>,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
