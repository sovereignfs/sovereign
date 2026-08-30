// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shouldHandleDndEvent } from '../useReorderSensors';

describe('shouldHandleDndEvent', () => {
  it('refuses an element nested inside a data-no-dnd ancestor', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-no-dnd', '');
    const child = document.createElement('button');
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);

    expect(shouldHandleDndEvent(child)).toBe(false);
  });

  it('allows an element with no data-no-dnd ancestor', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    expect(shouldHandleDndEvent(el)).toBe(true);
  });

  it('allows a non-Element target', () => {
    expect(shouldHandleDndEvent(null)).toBe(true);
  });
});
