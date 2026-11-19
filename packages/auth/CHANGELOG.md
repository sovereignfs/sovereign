# Changelog: @sovereignfs/auth

What changed in each version of the sign-in core and every Sovereign app share, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is
written in the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.1.0] - 2026-11-19

### Added

- The part of core's sign-in that is not about core
  ([RFC 0007](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0007-one-sign-in.md)): `createAuthPreset`, better-auth's
  options with every rule a sign-in keeps; the settings resolver; the account and session checks; asking for the password again; a
  person's sessions; the cookie names and the password policy; the session read and page guards with the app's own check between;
  and the account tables with their migrations for apps. Not published yet.
