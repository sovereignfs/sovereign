/** One thing wrong with a manifest, with where it is, in words an author or an operator can act on. */
export type Problem = { at: string; message: string };

/** How an app is signed in through core (`contracts/app-manifest.md` §2.1). */
export type SignIn = {
  redirect: string[];
  postLogout?: string[];
  backChannel?: string;
  accountDeleted?: string;
  scopes: string[];
};

type Common = {
  name: string;
  description?: string;
  icon?: string;
  port: number;
  health: string;
  launch?: string;
  database?: boolean | { pooling?: 'transaction' };
  data?: string[];
};

/** Manifest 1 as the document has it (`contracts/app-manifest.md` §5.1): an upper-case prefix, a sign-in and a core range always. */
export type Manifest1 = Common & {
  manifest: 1;
  prefix: string;
  signIn: SignIn;
  generate?: string[];
  core: string;
};

/** A secret the server makes: a name, or a name with its size in bytes (§2.5). */
export type GenerateEntry = string | { name: string; bytes?: number };

/** Manifest 2 (§2): a lower-case prefix, and a sign-in and a core range only if the app signs people in through core. */
export type Manifest2 = Common & {
  manifest: 2;
  prefix: string;
  signIn?: SignIn;
  generate?: GenerateEntry[];
  core?: string;
};

/** A manifest, of any version this package reads. */
export type Manifest = Manifest1 | Manifest2;
