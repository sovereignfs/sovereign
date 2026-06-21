import { createMailer } from '@sovereignfs/mailer';

const mailer = createMailer();

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  await mailer.send(options);
}
