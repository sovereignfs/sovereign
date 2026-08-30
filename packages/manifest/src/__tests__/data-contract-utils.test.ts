import { describe, expect, it } from 'vitest';
import { pluginContractName } from '../data-contract-utils';

describe('pluginContractName', () => {
  it('namespaces a local contract name to <pluginId>:<contract>', () => {
    expect(pluginContractName('com.acme.myapp', 'expenses')).toBe('com.acme.myapp:expenses');
  });

  it('keeps two plugins choosing the same local contract name distinct', () => {
    const a = pluginContractName('com.acme.finance', 'expenses');
    const b = pluginContractName('com.acme.ledger', 'expenses');
    expect(a).not.toBe(b);
  });
});
