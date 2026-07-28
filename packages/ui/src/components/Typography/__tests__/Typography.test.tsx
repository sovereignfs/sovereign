// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Typography } from '../Typography';

afterEach(cleanup);

describe('Typography', () => {
  it('renders the default tag for each variant', () => {
    render(<Typography variant="h1">Title</Typography>);
    expect(screen.getByText('Title').tagName).toBe('H1');
  });

  it('renders body as a <p> by default', () => {
    render(<Typography variant="body">Body copy</Typography>);
    expect(screen.getByText('Body copy').tagName).toBe('P');
  });

  it('renders label as a <span> by default', () => {
    render(<Typography variant="label">Section</Typography>);
    expect(screen.getByText('Section').tagName).toBe('SPAN');
  });

  it('overrides the rendered tag via `as` while keeping the variant class', () => {
    render(
      <Typography variant="h1" as="div">
        Title
      </Typography>,
    );
    const el = screen.getByText('Title');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain('h1');
  });
});
