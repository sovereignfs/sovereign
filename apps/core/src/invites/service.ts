import { getDatabase } from '../database';
import { getEmailService } from '../mail';
import { InviteManager } from './manage';

let manager: Promise<InviteManager> | undefined;

/** The path of an invitation link: public, and the only page that takes the invitation's id. */
export const invitePath = (id: string): string => `/invite/${encodeURIComponent(id)}`;

/** What an operator does with invitations, for the life of the process; the email is built from `SV_URL`. */
export function getInviteManager(): Promise<InviteManager> {
  manager ??= getDatabase()
    .then(
      (database) =>
        new InviteManager(database, {
          send: async (invite) => {
            const emails = await getEmailService();
            await emails.send(invite.email, {
              template: 'invite',
              link: emails.link(invitePath(invite.id)),
              ...(invite.expiresAt ? { expiresAt: invite.expiresAt } : {}),
            });
            return true;
          },
        }),
    )
    .catch((error: unknown) => {
      manager = undefined;
      throw error;
    });
  return manager;
}

/** The link to an invitation, for an operator to pass on when email is not set up. */
export async function inviteLink(id: string): Promise<string> {
  return (await getEmailService()).link(invitePath(id));
}
