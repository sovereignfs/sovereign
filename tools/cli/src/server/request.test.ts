import { describe, expect, it } from 'vitest';
import { Refused } from '../errors.js';
import { parseRequest } from './request.js';

const commit = 'a'.repeat(40);

describe('what the server is asked', () => {
  it('reads each verb with the words it takes', () => {
    expect(parseRequest(`deploy ${commit}`)).toEqual({ verb: 'deploy', commit });
    expect(parseRequest('status')).toEqual({ verb: 'status' });
    expect(parseRequest('logs notes 50')).toEqual({ verb: 'logs', target: 'notes', lines: 50 });
    expect(parseRequest('logs deploy')).toEqual({ verb: 'logs', target: 'deploy', lines: 200 });
    expect(parseRequest('seed')).toEqual({ verb: 'seed', json: false });
    expect(parseRequest('seed --json')).toEqual({ verb: 'seed', json: true });
    expect(parseRequest('logs mailpit 20')).toEqual({ verb: 'logs', target: 'mailpit', lines: 20 });
    expect(parseRequest('app notes --secret')).toEqual({
      verb: 'app',
      name: 'notes',
      secret: true,
    });
    expect(parseRequest('rotate notes')).toEqual({ verb: 'rotate', name: 'notes' });
  });

  it('reads what a backup or a restore covers: the whole instance, core, and apps by name', () => {
    expect(parseRequest('backup')).toEqual({ verb: 'backup', scope: { all: true } });
    expect(parseRequest('backup core app notes app tasks')).toEqual({
      verb: 'backup',
      scope: { all: false, core: true, apps: ['notes', 'tasks'] },
    });
    expect(parseRequest(`restore ${commit}`)).toEqual({ verb: 'restore', commit });
    expect(parseRequest(`restore ${commit} app notes`)).toEqual({
      verb: 'restore',
      commit,
      scope: { all: false, core: false, apps: ['notes'] },
    });
    for (const line of [
      'backup all',
      'backup core core',
      'backup app',
      'backup app Notes',
      'backup app notes app notes',
      'backup app notes; id',
      `restore ${commit} --core`,
      'restore core',
    ]) {
      expect(() => parseRequest(line), line).toThrow(Refused);
    }
  });

  it('refuses anything else, including what a shell would read as more than one word', () => {
    for (const line of [
      '',
      'rm -rf /',
      `deploy ${commit}; id`,
      'deploy abc',
      'deploy $(id)',
      'logs ../etc',
      'seed now',
      'seed --json --local',
      'seed; id',
      'logs notes 1; id',
      'app Notes',
      'rotate notes extra',
      'status --json',
    ]) {
      expect(() => parseRequest(line), line).toThrow(Refused);
    }
  });
});
