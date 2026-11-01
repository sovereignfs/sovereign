/** `suite.yml`, as the schema allows it (contracts/suite.md §1). Read from a file that has passed the schema. */
export type Launcher = {
  description?: string;
  icon?: string;
  launchUrl?: string;
  show?: boolean;
};

export type HostedApp = {
  image: string;
  manifest?: string;
  env?: Record<string, string>;
  launcher?: Launcher;
};

export type ExternalApp = {
  external: true;
  name: string;
  redirect: string[];
  postLogout?: string[];
  backChannel?: string;
  scopes?: string[];
  type?: 'confidential' | 'public';
  trusted?: boolean;
  launcher?: Launcher;
};

export type App = HostedApp | ExternalApp;

export const isExternal = (app: App): app is ExternalApp => 'external' in app;

export type Environment = 'development' | 'staging' | 'production';

export type Suite = {
  schema: 1;
  domain: string;
  environment?: Environment;
  core: { version: string; env?: Record<string, string> };
  database: { version: string };
  server: {
    host: string;
    port?: number;
    user?: string;
    deploy?: 'ssh' | 'github';
    hostKey?: string;
  };
  tls?: { mode?: 'per-host' | 'internal'; email?: string };
  secrets: { recipients: string[] };
  apps?: Record<string, App>;
  purge?: string[];
};

export type Digest = { ref: string; digest: string };

/** `suite.lock` (contracts/suite.md §2). */
export type Lock = {
  schema: 1;
  images: { cli: Digest; core: Digest; database: Digest; proxy: Digest; mail?: Digest };
  apps?: Record<string, Digest>;
};

/** An app's manifest (contracts/app-manifest.md §2). */
export type Manifest = {
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
  database?: boolean;
  generate?: string[];
  data?: string[];
  core: string;
};
