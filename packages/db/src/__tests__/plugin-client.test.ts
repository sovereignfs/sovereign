import { describe, expect, it } from 'vitest';
import { dropPluginDb, getPluginDb, pluginSchemaName, pluginSqliteUrl } from '../plugin-client';

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

describe('getPluginDb', () => {
  it('uses an explicit SQLite override even when the platform dialect is Postgres', async () => {
    const originalDialect = process.env.DB_DIALECT;
    const originalUrl = process.env.DATABASE_URL;
    process.env.DB_DIALECT = 'postgres';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/sovereign_test';

    try {
      const pluginDb = getPluginDb('io.example.sqlite-plugin', 'sqlite');
      expect(pluginDb.dialect).toBe('sqlite');
    } finally {
      await dropPluginDb('io.example.sqlite-plugin', 'sqlite');
      if (originalDialect === undefined) {
        delete process.env.DB_DIALECT;
      } else {
        process.env.DB_DIALECT = originalDialect;
      }
      if (originalUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalUrl;
      }
    }
  });
});
