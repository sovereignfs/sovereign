/** One thing wrong with a manifest, with where it is, in words an author or an operator can act on. */
export type Problem = { at: string; message: string };

/** Manifest 1 as the document has it (`contracts/app-manifest.md` §5.1). */
export type Manifest1 = {
  manifest: 1;
  prefix: string;
  name: string;
  description?: string;
  icon?: string;
  port: number;
  health: string;
  launch?: string;
  signIn: {
    redirect: string[];
    postLogout?: string[];
    backChannel?: string;
    accountDeleted?: string;
    scopes: string[];
  };
  database?: boolean | { pooling?: 'transaction' };
  generate?: string[];
  data?: string[];
  core: string;
};

/** A manifest, of any version this package reads. */
export type Manifest = Manifest1;
