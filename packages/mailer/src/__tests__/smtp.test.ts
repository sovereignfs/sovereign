/**
 * The SMTP transport against a real SMTP server (smtp-server, from nodemailer's author), running
 * in this process: no Docker and no network, so it runs in `pnpm test` and in CI. The unit tests
 * stub nothing here, because a stubbed nodemailer keeps passing whatever the real library does.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { simpleParser, type ParsedMail } from 'mailparser';
import { SMTPServer, type SMTPServerOptions } from 'smtp-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { isMailError } from '../errors';
import { createMailer } from '../mailer';
import { createSmtpTransport } from '../smtp';
import type { SmtpSettings } from '../types';

const FROM = 'Sovereign <no-reply@example.com>';
const USER = 'mailer-user';
const PASSWORD = 'correct-horse-battery-staple';

let folder: string;
let key: string;
let cert: string;

beforeAll(() => {
  // A throwaway certificate for 127.0.0.1, so TLS can be tested with verification ON.
  folder = mkdtempSync(path.join(tmpdir(), 'sv-smtp-'));
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-keyout',
        path.join(folder, 'key.pem'),
        '-out',
        path.join(folder, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1,DNS:localhost',
      ],
      { stdio: 'pipe' },
    );
  } catch (error) {
    throw new Error('These tests need the openssl command to make a test certificate.', {
      cause: error,
    });
  }
  key = readFileSync(path.join(folder, 'key.pem'), 'utf8');
  cert = readFileSync(path.join(folder, 'cert.pem'), 'utf8');
});

afterAll(() => rmSync(folder, { recursive: true, force: true }));

type Running = {
  port: number;
  mails: ParsedMail[];
  auths: { user: string; password: string }[];
  close(): Promise<void>;
};
const running: Running[] = [];

async function startServer(
  options: SMTPServerOptions & { reject?: string } = {},
): Promise<Running> {
  const mails: ParsedMail[] = [];
  const auths: { user: string; password: string }[] = [];
  const { reject, ...serverOptions } = options;
  const server = new SMTPServer({
    disabledCommands: ['AUTH'],
    authOptional: true,
    // A plain server: smtp-server would otherwise offer STARTTLS with a built-in certificate that
    // nothing trusts (which the transport rightly refuses). TLS cases pass their own certificate.
    hideSTARTTLS: true,
    logger: false,
    onAuth(auth, _session, callback) {
      auths.push({ user: auth.username ?? '', password: auth.password ?? '' });
      if (auth.username === USER && auth.password === PASSWORD)
        callback(null, { user: auth.username });
      else callback(Object.assign(new Error('Invalid login'), { responseCode: 535 }));
    },
    onRcptTo(address, _session, callback) {
      if (reject && address.address === reject)
        callback(Object.assign(new Error('No such user'), { responseCode: 550 }));
      else callback();
    },
    onData(stream, _session, callback) {
      void simpleParser(stream).then((mail) => {
        mails.push(mail);
        callback();
      });
    },
    ...serverOptions,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.server.address() as net.AddressInfo).port;
  const handle: Running = {
    port,
    mails,
    auths,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  running.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

const withAuth = { disabledCommands: [] as string[] };
const settings = (port: number, extra: Partial<SmtpSettings> = {}): SmtpSettings => ({
  host: '127.0.0.1',
  port,
  from: FROM,
  ...extra,
});
const message = {
  to: 'person@example.com',
  subject: 'Hello there',
  text: 'Plain text',
  html: '<p>HTML <b>body</b></p>',
};

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!isMailError(error)) throw new Error(`expected a MailError, got ${String(error)}`);
  return error;
}

describe('sending through a real server', () => {
  it('delivers the message, with its sender, recipient, subject, text and html', async () => {
    const server = await startServer();
    const transport = createSmtpTransport(settings(server.port));
    const result = await createMailer(transport, { from: FROM }).send(message);
    transport.close?.();

    expect(result).toEqual({ accepted: ['person@example.com'], rejected: [] });
    expect(server.mails).toHaveLength(1);
    const mail = server.mails[0] as ParsedMail;
    expect(mail.from?.value[0]).toMatchObject({
      name: 'Sovereign',
      address: 'no-reply@example.com',
    });
    expect(mail.to).toMatchObject({ value: [{ address: 'person@example.com' }] });
    expect(mail.subject).toBe('Hello there');
    expect(mail.text?.trim()).toBe('Plain text');
    expect(mail.html).toContain('<b>body</b>');
  });

  it('sends to several recipients at once', async () => {
    const server = await startServer();
    const transport = createSmtpTransport(settings(server.port));
    const result = await createMailer(transport, { from: FROM }).send({
      ...message,
      to: ['a@example.com', 'b@example.com'],
    });
    transport.close?.();
    expect(result.accepted).toEqual(['a@example.com', 'b@example.com']);
    expect(server.mails[0]?.to).toMatchObject({
      value: [{ address: 'a@example.com' }, { address: 'b@example.com' }],
    });
  });

  it('carries non-ASCII subjects and bodies intact', async () => {
    const server = await startServer();
    const transport = createSmtpTransport(settings(server.port));
    await createMailer(transport, { from: FROM }).send({
      to: 'person@example.com',
      subject: 'Zugang für Jürgen 🔐',
      text: 'Grüße 日本語',
    });
    transport.close?.();
    expect(server.mails[0]?.subject).toBe('Zugang für Jürgen 🔐');
    expect(server.mails[0]?.text?.trim()).toBe('Grüße 日本語');
  });
});

describe('credentials', () => {
  it('log in over STARTTLS when the certificate is trusted, and the password is not sent in the clear', async () => {
    const server = await startServer({
      ...withAuth,
      key,
      cert,
      secure: false,
      hideSTARTTLS: false,
    });
    const transport = createSmtpTransport(
      settings(server.port, { user: USER, password: PASSWORD }),
      { tls: { ca: cert } },
    );
    await createMailer(transport, { from: FROM }).send(message);
    transport.close?.();
    expect(server.auths).toEqual([{ user: USER, password: PASSWORD }]);
    expect(server.mails).toHaveLength(1);
  });

  it('log in over implicit TLS (port 465 style) too', async () => {
    const server = await startServer({ ...withAuth, key, cert, secure: true });
    const transport = createSmtpTransport(
      settings(server.port, { user: USER, password: PASSWORD, secure: true }),
      { tls: { ca: cert } },
    );
    await createMailer(transport, { from: FROM }).send(message);
    transport.close?.();
    expect(server.auths).toHaveLength(1);
    expect(server.mails).toHaveLength(1);
  });

  it('are never sent to a server that does not offer TLS: the send fails instead', async () => {
    const server = await startServer({ ...withAuth, allowInsecureAuth: true });
    const transport = createSmtpTransport(
      settings(server.port, { user: USER, password: PASSWORD }),
    );
    const error = await failure(createMailer(transport, { from: FROM }).send(message));
    transport.close?.();
    expect(error.code).toBe('connection-failed');
    expect(server.auths, 'the password was never sent').toEqual([]);
    expect(server.mails).toEqual([]);
  });

  it('are never sent to a server whose certificate is not trusted', async () => {
    const server = await startServer({
      ...withAuth,
      key,
      cert,
      secure: false,
      hideSTARTTLS: false,
    });
    const transport = createSmtpTransport(
      settings(server.port, { user: USER, password: PASSWORD }),
    );
    const error = await failure(createMailer(transport, { from: FROM }).send(message));
    transport.close?.();
    expect(error.code).toBe('connection-failed');
    expect(server.auths).toEqual([]);
  });

  it('are refused with a clear message when wrong, and the message never repeats them', async () => {
    const server = await startServer({
      ...withAuth,
      key,
      cert,
      secure: false,
      hideSTARTTLS: false,
    });
    const transport = createSmtpTransport(
      settings(server.port, { user: USER, password: 'the-wrong-password' }),
      { tls: { ca: cert } },
    );
    const error = await failure(createMailer(transport, { from: FROM }).send(message));
    transport.close?.();
    expect(error.code).toBe('authentication-failed');
    expect(error.responseCode).toBe(535);
    expect(error.message).toBe('The mail server refused the SMTP user name or password.');
    expect(error.message + JSON.stringify(error)).not.toContain('the-wrong-password');
    expect(error.message).not.toContain(USER);
  });

  it('are not needed on a server that wants none, even over a plain port', async () => {
    const server = await startServer();
    const transport = createSmtpTransport(settings(server.port));
    await createMailer(transport, { from: FROM }).send(message);
    transport.close?.();
    expect(server.auths).toEqual([]);
  });
});

describe('when sending goes wrong', () => {
  it('says the server could not be reached, quickly, when nothing is listening', async () => {
    const free = await new Promise<number>((resolve) => {
      const probe = net.createServer().listen(0, '127.0.0.1', () => {
        const port = (probe.address() as net.AddressInfo).port;
        probe.close(() => resolve(port));
      });
    });
    const transport = createSmtpTransport(settings(free));
    const started = Date.now();
    const error = await failure(createMailer(transport, { from: FROM }).send(message));
    transport.close?.();
    expect(error.code).toBe('connection-failed');
    expect(error.message).toContain('could not be reached');
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('gives up on a server that accepts the connection and never greets, within the timeout', async () => {
    const sockets = new Set<net.Socket>();
    const silent = net.createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const port = (silent.address() as net.AddressInfo).port;
    const transport = createSmtpTransport(settings(port), {
      timeouts: { greetingTimeout: 300, connectionTimeout: 300 },
    });
    const started = Date.now();
    const error = await failure(createMailer(transport, { from: FROM }).send(message));
    transport.close?.();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => silent.close(() => resolve()));
    expect(error.code).toBe('connection-failed');
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('reports a rejected recipient as rejected', async () => {
    const server = await startServer({ reject: 'blocked@example.com' });
    const transport = createSmtpTransport(settings(server.port));
    const error = await failure(
      createMailer(transport, { from: FROM }).send({ ...message, to: 'blocked@example.com' }),
    );
    transport.close?.();
    expect(error.code).toBe('rejected');
    expect(error.responseCode).toBe(550);
    expect(error.message).not.toContain('blocked@example.com');
  });

  it('treats a partly refused send as a send, and says who was refused', async () => {
    const server = await startServer({ reject: 'blocked@example.com' });
    const transport = createSmtpTransport(settings(server.port));
    const result = await createMailer(transport, { from: FROM }).send({
      ...message,
      to: ['ok@example.com', 'blocked@example.com'],
    });
    transport.close?.();
    expect(result.accepted).toEqual(['ok@example.com']);
    expect(result.rejected).toEqual(['blocked@example.com']);
  });
});
