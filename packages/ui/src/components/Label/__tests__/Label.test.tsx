// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Label } from '../Label';

afterEach(cleanup);

describe('Label', () => {
  it('renders a real <label> element', () => {
    render(<Label htmlFor="agree">I agree</Label>);
    expect(screen.getByText('I agree').tagName).toBe('LABEL');
  });

  it('associates with a control via htmlFor', () => {
    render(
      <>
        <Label htmlFor="agree">I agree to the terms</Label>
        <input id="agree" type="checkbox" />
      </>,
    );
    expect(screen.getByLabelText('I agree to the terms')).toBeDefined();
  });

  it('applies disabled styling without disabling the underlying element', () => {
    render(
      <Label htmlFor="agree" disabled>
        I agree
      </Label>,
    );
    expect(screen.getByText('I agree').className).toContain('disabled');
  });
});
