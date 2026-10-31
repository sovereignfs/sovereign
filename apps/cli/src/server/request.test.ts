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
    expect(parseRequest('app notes --secret')).toEqual({
      verb: 'app',
      name: 'notes',
      secret: true,
    });
    expect(parseRequest('rotate notes')).toEqual({ verb: 'rotate', name: 'notes' });
  });

  it('refuses anything else, including what a shell would read as more than one word', () => {
    for (const line of [
      '',
      'rm -rf /',
      `deploy ${commit}; id`,
      'deploy abc',
      'deploy $(id)',
      'logs ../etc',
      'logs notes 1; id',
      'app Notes',
      'rotate notes extra',
      'status --json',
    ]) {
      expect(() => parseRequest(line), line).toThrow(Refused);
    }
  });
});
