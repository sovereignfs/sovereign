import { describe, expect, it } from 'vitest';
import { pluginCapabilityName } from '../cap-utils';

describe('pluginCapabilityName', () => {
  it('namespaces a simple capability', () => {
    expect(pluginCapabilityName('com.acme.myapp', 'create-item')).toBe(
      'com.acme.myapp:create-item',
    );
  });

  it('works with reverse-DNS plugin IDs', () => {
    expect(pluginCapabilityName('fs.sovereign.example-basic', 'view-advanced')).toBe(
      'fs.sovereign.example-basic:view-advanced',
    );
  });

  it('works with single-segment plugin IDs', () => {
    expect(pluginCapabilityName('splitify', 'create-group')).toBe('splitify:create-group');
  });
});
