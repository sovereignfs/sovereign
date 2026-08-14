import { describe, expect, it } from 'vitest';
import { effectiveRequiresConfirmation, pluginToolName } from '../tool-utils';

describe('pluginToolName', () => {
  it('namespaces a local tool name to <pluginId>:<name>', () => {
    expect(pluginToolName('com.acme.myapp', 'create-record')).toBe('com.acme.myapp:create-record');
  });
});

describe('effectiveRequiresConfirmation (RFC 0047 effect-class defaults)', () => {
  it('defaults to false for a read tool with no explicit override', () => {
    expect(effectiveRequiresConfirmation({ effect: 'read' })).toBe(false);
  });

  it('defaults to true for write and external tools with no explicit override', () => {
    expect(effectiveRequiresConfirmation({ effect: 'write' })).toBe(true);
    expect(effectiveRequiresConfirmation({ effect: 'external' })).toBe(true);
  });

  it('an explicit requiresConfirmation always wins over the effect-class default', () => {
    expect(effectiveRequiresConfirmation({ effect: 'read', requiresConfirmation: true })).toBe(
      true,
    );
    expect(effectiveRequiresConfirmation({ effect: 'write', requiresConfirmation: false })).toBe(
      false,
    );
  });
});
