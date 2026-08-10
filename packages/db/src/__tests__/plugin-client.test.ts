import { describe, expect, it } from 'vitest';
import { pluginSchemaName } from '../plugin-client';

describe('pluginSchemaName', () => {
  it('prefixes with plugin_ and maps dots and hyphens to underscores', () => {
    expect(pluginSchemaName('fs.sovereign.tasks')).toBe('plugin_fs_sovereign_tasks');
    expect(pluginSchemaName('io.example.my-plugin')).toBe('plugin_io_example_my_plugin');
    expect(pluginSchemaName('com.acme.foo')).toBe('plugin_com_acme_foo');
  });

  it('handles plain IDs without dots or hyphens', () => {
    expect(pluginSchemaName('tasks')).toBe('plugin_tasks');
  });
});
