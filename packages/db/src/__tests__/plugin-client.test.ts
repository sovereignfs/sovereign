import { describe, expect, it } from 'vitest';
import { pluginSchemaName, pluginSqliteUrl } from '../plugin-client';

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

describe('pluginSqliteUrl', () => {
  it('returns a file: URL pointing into data/plugins/', () => {
    const url = pluginSqliteUrl('fs.sovereign.tasks');
    expect(url).toBe('file:./data/plugins/fs.sovereign.tasks.db');
  });

  it('preserves dots in the filename', () => {
    expect(pluginSqliteUrl('io.example.my-plugin')).toBe(
      'file:./data/plugins/io.example.my-plugin.db',
    );
  });
});
