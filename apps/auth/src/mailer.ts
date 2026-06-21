import nodemailer, { type Transporter } from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let _transporter: Transporter | undefined;
let _from: string | undefined;
let _configured: boolean | undefined;

function lazyInit() {
  if (_configured !== undefined) return;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  _from = process.env.SMTP_FROM ?? 'noreply@localhost';
  _configured = Boolean(host);
  if (_configured && host) {
    _transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }
}

export async function sendMail(options: MailOptions): Promise<void> {
  lazyInit();
  if (!_configured || !_transporter) {
    console.warn(
      `[auth/mailer] SMTP not configured (SMTP_HOST unset); skipping "${options.subject}".`,
    );
    return;
  }
  await _transporter.sendMail({
    from: _from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}
