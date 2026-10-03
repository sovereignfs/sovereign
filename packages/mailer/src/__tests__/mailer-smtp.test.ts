import { afterEach, describe, expect, it } from 'vitest';
import net from 'node:net';
import { createMailer } from '../mailer';

/**
 * The one mailer test that does NOT mock nodemailer.
 *
 * `mailer.test.ts` stubs the whole module, which is right for asserting our
 * own config resolution and field mapping but means it keeps passing no
 * matter what the real library does — a nodemailer major could change its
 * export shape, its transport options or its wire output and every test here
 * would stay green. That is not hypothetical: the 9 → 10 bump moved the
 * package to a dual ESM/CJS build with an `exports` map and `"type":
 * "module"`, which is exactly the kind of change a mocked `import nodemailer
 * from 'nodemailer'` cannot exercise.
 *
 * So this drives a real `createTransport` → `sendMail` against a throwaway
 * SMTP server and asserts on the bytes that reach the wire. It is the same
 * discipline the better-auth rule in CLAUDE.md states for that dependency:
 * verify a bump against something real, not only against a stub.
 *
 * Deliberately a plain `net` server speaking the minimum SMTP needed, not
 * Mailpit: this has to run in CI and in `pnpm test` with no Docker and no
 * network.
 */

/** Lines the server saw, split into the envelope commands and the DATA body. */
interface Captured {
  port: number;
  lines: string[];
  close: () => Promise<void>;
}

async function startSmtpSink(): Promise<Captured> {
  const lines: string[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    // Nothing here should ever surface as an unhandled error: the client
    // hangs up after QUIT, and on some platforms that lands as ECONNRESET
    // on this side rather than a clean FIN.
    socket.on('error', () => undefined);

    let buffer = '';
    let inData = false;
    socket.write('220 sink.test ESMTP\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 OK queued\r\n');
          } else {
            lines.push(line);
          }
          continue;
        }

        const command = line.split(' ')[0]?.toUpperCase();
        if (command === 'EHLO' || command === 'HELO') {
          socket.write('250-sink.test\r\n250 SIZE 10240000\r\n');
        } else if (command === 'MAIL' || command === 'RCPT') {
          lines.push(line);
          socket.write('250 OK\r\n');
        } else if (command === 'DATA') {
          inData = true;
          socket.write('354 Send it\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });

  // Port 0 — the OS picks a free one, so a developer already running Mailpit
  // (or a parallel vitest worker) can't collide with this.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('SMTP sink did not bind to a TCP port');
  }

  return {
    port: address.port,
    lines,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

let sink: Captured | undefined;

afterEach(async () => {
  await sink?.close();
  sink = undefined;
});

describe('createMailer against a real SMTP server (nodemailer unmocked)', () => {
  it('delivers a message whose envelope, headers and parts match what was passed', async () => {
    sink = await startSmtpSink();

    const mailer = createMailer({
      host: '127.0.0.1',
      port: sink.port,
      from: 'Sovereign <no-reply@example.test>',
    });
    expect(mailer.configured).toBe(true);

    await mailer.send({
      to: 'someone@example.test',
      subject: 'Monthly recap',
      html: '<p>Hello from <b>Sovereign</b></p>',
      text: 'Hello from Sovereign',
    });

    const wire = sink.lines.join('\n');

    // Envelope — `from` falls back to the mailer's configured sender.
    expect(wire).toMatch(/^MAIL FROM:<no-reply@example\.test>/m);
    expect(wire).toMatch(/^RCPT TO:<someone@example\.test>/m);

    // Headers — the display name survives, and the subject is a plain
    // ASCII header here (see the next test for the encoded-word case).
    expect(wire).toMatch(/^From: Sovereign <no-reply@example\.test>/m);
    expect(wire).toMatch(/^To: someone@example\.test/m);
    expect(wire).toMatch(/^Subject: Monthly recap/m);

    // Passing both html and text must still produce a two-part alternative
    // body rather than silently dropping one of them.
    expect(wire).toMatch(/multipart\/alternative/);
    expect(wire).toContain('Hello from Sovereign');
    expect(wire).toContain('<p>Hello from <b>Sovereign</b></p>');
  });

  it('encodes a non-ASCII subject as an RFC 2047 encoded word', async () => {
    sink = await startSmtpSink();

    const mailer = createMailer({
      host: '127.0.0.1',
      port: sink.port,
      from: 'no-reply@example.test',
    });
    // Every localized template subject can carry non-ASCII (SUPPORTED_EMAIL_LOCALES),
    // so a raw 8-bit Subject header would be a real interoperability bug.
    await mailer.send({ to: 'someone@example.test', subject: 'Résumé — März', text: 'hi' });

    expect(sink.lines.join('\n')).toMatch(/^Subject: =\?UTF-8\?[QB]\?/m);
  });
});
