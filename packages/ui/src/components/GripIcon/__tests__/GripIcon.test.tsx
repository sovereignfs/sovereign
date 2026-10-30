// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { GripIcon } from '../GripIcon';

afterEach(cleanup);

describe('GripIcon', () => {
  it('draws six dots, and is hidden from assistive technology', () => {
    const { container } = render(<GripIcon />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('circle')).toHaveLength(6);
  });

  it('is 14 pixels unless sized, and takes the caller’s class', () => {
    const { container } = render(<GripIcon size={20} className="mine" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
    expect(svg?.getAttribute('class')).toBe('mine');
    cleanup();
    expect(
      render(<GripIcon />)
        .container.querySelector('svg')
        ?.getAttribute('width'),
    ).toBe('14');
  });

  it('takes its colour from the text around it', () => {
    const { container } = render(<GripIcon />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('currentColor');
  });
});
