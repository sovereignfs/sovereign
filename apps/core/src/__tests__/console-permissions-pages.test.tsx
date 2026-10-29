import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { DEFAULT_MATRIX } from '../roles/capabilities';

const getSession = vi.fn();
vi.mock('../auth/session', () => ({ getSession: () => getSession() as unknown }));
const matrixInForce = vi.fn();
vi.mock('../roles/matrix', () => ({
  getCapabilityMatrix: () => matrixInForce() as unknown,
  loadMatrix: () => matrixInForce() as unknown,
}));
vi.mock('../database', () => ({ getDatabase: () => Promise.resolve({}) }));
const listTransferTargets = vi.fn();
vi.mock('../roles/ownership', () => ({
  listTransferTargets: (...args: unknown[]) => listTransferTargets(...args) as unknown,
}));
vi.mock('../../app/console/permissions/actions', () => ({
  saveMatrixAction: vi.fn(),
  resetMatrixAction: vi.fn(),
}));
vi.mock('../../app/console/ownership/actions', () => ({ transferOwnershipAction: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));

const { default: PermissionsPage } = await import('../../app/console/permissions/page');
const { default: OwnershipPage } = await import('../../app/console/ownership/page');

const as = (role: unknown, id = 'x') => getSession.mockResolvedValue({ user: { id, role } });
const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as { digest?: string };
  }
  return undefined;
};
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(null);
  matrixInForce.mockReset().mockResolvedValue(DEFAULT_MATRIX);
  listTransferTargets.mockReset().mockResolvedValue([]);
});

describe('the permissions page', () => {
  it('is the owner’s alone: a page that is not there for an admin, and sign-in for nobody', async () => {
    as(ROLE_ADMIN);
    expect((await failure(() => PermissionsPage()))?.digest).toBe(NOT_FOUND);
    as(ROLE_USER);
    expect((await failure(() => PermissionsPage()))?.digest).toBe(NOT_FOUND);
    getSession.mockResolvedValue(null);
    expect((await failure(() => PermissionsPage()))?.digest).toContain('/sign-in');
  });

  it('has one heading and every capability in words, none by its name in code', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await PermissionsPage());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    for (const label of [
      'Open the Console',
      'Manage accounts',
      'Manage apps',
      'Hand over ownership',
    ]) {
      expect(html).toContain(label);
    }
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/user:manage|console:access|client:manage/);
  });

  it('offers a box for each role on what may be given, and locks what is the owner’s', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await PermissionsPage());
    expect(html).toMatch(/<input[^>]*name="grant"[^>]*value="platform:admin\|client:manage"/);
    expect(html).toMatch(/<input[^>]*name="grant"[^>]*value="platform:user\|launcher:access"/);
    expect(html).not.toMatch(/value="platform:[a-z]+\|instance:configure-secrets"/);
    expect(html).not.toMatch(/value="platform:[a-z]+\|ownership:transfer"/);
    expect(html.match(/Only the owner/g)?.length).toBe(4);
  });

  it('starts each box as the matrix in force says', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await PermissionsPage());
    const box = (value: string) =>
      new RegExp(
        `<input[^>]*checked=""[^>]*value="${value.replace('|', '\\|')}"|<input[^>]*value="${value.replace('|', '\\|')}"[^>]*checked=""`,
      );
    expect(html).toMatch(box('platform:admin|client:manage'));
    expect(html).not.toMatch(box('platform:user|client:manage'));
  });
});

describe('the ownership page', () => {
  it('is the owner’s alone, and no admin list is read for anyone else', async () => {
    as(ROLE_ADMIN);
    expect((await failure(() => OwnershipPage()))?.digest).toBe(NOT_FOUND);
    getSession.mockResolvedValue(null);
    expect((await failure(() => OwnershipPage()))?.digest).toContain('/sign-in');
    expect(listTransferTargets).not.toHaveBeenCalled();
  });

  it('offers the admins other than the owner, asked for the owner’s own id', async () => {
    as(ROLE_OWNER, 'owner-1');
    listTransferTargets.mockResolvedValue([
      { id: 'a1', name: 'Ada Admin', email: 'ada@example.com' },
      { id: 'a2', name: 'Bo Admin', email: 'bo@example.com' },
    ]);
    const html = renderToStaticMarkup(await OwnershipPage());
    expect(listTransferTargets).toHaveBeenCalledWith(expect.anything(), 'owner-1');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Ada Admin (ada@example.com)');
    expect(html).toContain('Bo Admin (bo@example.com)');
    expect(html).toContain('Hand over ownership…');
  });

  it('says what to do first when there is no admin to hand it to, rather than offering a form', async () => {
    as(ROLE_OWNER);
    const html = renderToStaticMarkup(await OwnershipPage());
    expect(html).toContain('There is no admin to hand it to');
    expect(html).toContain('href="/console/accounts"');
    expect(html).not.toContain('Your password');
  });
});
