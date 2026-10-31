/**
 * The default Privacy Policy and Terms of Service every instance serves (core-app §3.3.5). They say
 * only what is true of the software itself, for any instance: nothing here names an operator or a
 * jurisdiction, because nobody has confirmed one. Whoever runs an instance answers for how it is run.
 *
 * They are data, not Markdown: no renderer to depend on, and the text is part of what is built, so
 * the version a person accepts (`legalVersion`) is exactly the version they were shown.
 */
export type LegalBlock = string | { readonly list: readonly string[] };

export type LegalSection = { readonly heading: string; readonly blocks: readonly LegalBlock[] };

export type LegalDocument = {
  readonly title: string;
  readonly intro: readonly string[];
  readonly sections: readonly LegalSection[];
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  intro: [
    'This describes what Sovereign, the open-source software this instance runs, does with your information. It says only what is true of the software itself, for any instance: nothing here is specific to who runs this one.',
    'The Sovereign project does not run this instance and has no access to its data. Whoever runs it answers for how it is run, and for anything this page does not cover.',
  ],
  sections: [
    {
      heading: 'What we keep about you',
      blocks: [
        'When you create an account, this instance keeps:',
        {
          list: [
            'your name and email address, which you give;',
            'your password, only as a salted hash, never in plain text;',
            'your time zone, taken from your browser when you sign up, so dates show correctly. You can change it in your account settings;',
            'that you accepted the Terms of Service and this Privacy Policy, when, and which version of them.',
          ],
        },
        'It also keeps a record of each sign-in that is still open: when it began and ended, the address your connection came from, and a description of your browser. This is what lets you see and end your sessions.',
      ],
    },
    {
      heading: 'Cookies',
      blocks: [
        'Signing in sets a session cookie so you stay signed in, and a short-lived signed copy of your session that saves the instance a look-up on every page. A small cookie may remember your light or dark theme. None of them is used for advertising or to follow you between sites, and the software sets no third-party cookies.',
      ],
    },
    {
      heading: 'Email',
      blocks: [
        'This instance sends email only to run your account: a link to verify your address, a link to reset your password if you ask, a notice that your account was created, and an invitation if someone invites you. It goes through a mail server the person who runs this instance sets up; the software does not provide a mail service. No marketing email is sent.',
      ],
    },
    {
      heading: 'Apps you sign in to',
      blocks: [
        'Other apps may use this instance to sign you in. They receive only the details their sign-in request asks for and this instance allows, such as your name and email address. What an app does with them is described by that app, not here.',
      ],
    },
    {
      heading: 'Where your data is stored',
      blocks: [
        'Your account is stored in this instance’s own database, on infrastructure run by whoever runs the instance. Whether it is encrypted at rest depends on how the instance is set up. It is never sent to the Sovereign project.',
      ],
    },
    {
      heading: 'Your rights and how long we keep things',
      blocks: [
        'Your account is kept for as long as it exists. You can ask whoever runs this instance to correct or delete it, and where the instance offers it you can delete your account yourself from your account settings. Deleting it removes your account and its credentials.',
      ],
    },
    {
      heading: 'Children',
      blocks: [
        'This page does not set an age rule: that is for whoever runs the instance. If none has been published, assume there are no special arrangements for children.',
      ],
    },
    {
      heading: 'Changes',
      blocks: [
        'This is the default document that comes with the software. It changes when the software’s behaviour does, and the change is in the project’s release history. Accounts record which version was accepted.',
      ],
    },
  ],
};

export const TERMS: LegalDocument = {
  title: 'Terms of Service',
  intro: [
    'These are the default terms for using an instance of Sovereign, the open-source software it runs. They say only what is true of the software itself, for any instance: nothing here is specific to who runs this one.',
    'The Sovereign project is not a party to your use of this instance.',
  ],
  sections: [
    {
      heading: 'Your account',
      blocks: [
        'You are responsible for keeping your sign-in details private and for what is done with your account.',
      ],
    },
    {
      heading: 'Acceptable use',
      blocks: [
        'Do not use this instance for anything illegal, to harass or abuse other people, to reach accounts or data that are not yours, or to disrupt the service for others. Whoever runs the instance may suspend accounts that break this, and may set further rules for their own community.',
      ],
    },
    {
      heading: 'Apps you sign in to',
      blocks: [
        'Apps that use this instance to sign you in have terms and privacy practices of their own. These terms cover only this instance’s sign-in.',
      ],
    },
    {
      heading: 'Availability',
      blocks: [
        'The instance is provided on a best-effort basis. Neither uptime nor how long data is kept is guaranteed beyond the operator’s normal backup practice.',
      ],
    },
    {
      heading: 'Suspension and ending your account',
      blocks: [
        'Whoever runs the instance may suspend or end an account that breaks these terms. You may ask for your account to be deleted at any time, and where the instance offers it you can delete it yourself.',
      ],
    },
    {
      heading: 'No warranty, and limits on liability',
      blocks: [
        'The instance and the software are provided “as is”. To the extent the law allows, the Sovereign project takes no responsibility for how any instance is run or for your use of it.',
      ],
    },
    {
      heading: 'Changes',
      blocks: [
        'This is the default document that comes with the software. It changes when the software’s behaviour does, and the change is in the project’s release history. Accounts record which version was accepted.',
      ],
    },
  ],
};
