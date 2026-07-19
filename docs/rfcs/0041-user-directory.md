---
rfc: 0041
title: User directory and member selection SDK
status: Implemented
date: June 2026
author: kasunben
scope: >
  packages/sdk, runtime, apps/auth, packages/db, plugins/account, plugins/console,
  docs; builds on RFC 0021 and RFC 0035
incorporated_into_plan: 'Yes — epic task 1.12'
---

# RFC 0041 — User Directory and Member Selection SDK

## Summary

Add a privacy-preserving user-directory surface that lets plugins find and
select other users on the same Sovereign instance for sharing, assignment,
membership, and invitation flows.

The surface is intentionally narrow. It is not an admin user-management API and
does not expose inactive users, roles, MFA state, session data, or private
profile details. Plugins get enough information to let a current user share a
resource with another instance user, and no more.

## Motivation

Many plugin workflows need a user picker: share a list, invite a collaborator,
assign a record, add a member to a group, or send a notification to a known
person. Today plugins can read the current session but cannot search or resolve
other users through a stable SDK.

Without a platform surface, each plugin either cannot implement sharing, calls
admin-only runtime internals, or invents a private user table that drifts from
the auth source of truth. A shared user-directory SDK keeps plugins inside the
platform boundary and lets Sovereign enforce consistent privacy rules.

## Current state

- `sdk.auth.getSession()` and `sdk.auth.requireSession()` expose only the
  current user.
- Console has admin user-management routes, but those are not a public plugin
  contract.
- Platform roles and capabilities exist, but they do not provide a member
  lookup mechanism.
- User verification levels are specified separately in RFC 0035 and may later
  influence which users are eligible for sensitive sharing flows.

## Proposed design

### SDK surface

Add an experimental `sdk.directory` namespace:

```ts
interface DirectoryUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

interface SearchUsersInput {
  query: string;
  limit?: number;
}

interface ResolveUsersInput {
  ids: string[];
}

sdk.directory.searchUsers(input: SearchUsersInput): Promise<DirectoryUser[]>;
sdk.directory.resolveUsers(input: ResolveUsersInput): Promise<DirectoryUser[]>;
```

`searchUsers` performs prefix/substring matching against display name and email.
The minimum query length is 2 characters. Results are capped to 20 by default
and 50 maximum.

`resolveUsers` accepts explicit user IDs already stored in plugin membership
tables and returns display-safe profile data for active users.

### Visibility rules

The directory returns only:

- active users;
- users in the same tenant;
- display-safe fields: ID, email, name, image.

It does not return:

- role;
- capabilities;
- verification level;
- active session metadata;
- account flags such as test-user state;
- disabled/deactivated accounts.

If a user becomes inactive, `resolveUsers` omits them by default. Plugins may
keep historical membership rows but should render them as unavailable or
inactive based on local state.

### Capability and permission model

No new manifest permission is required for basic directory search. Sharing with
other users is common enough that requiring a permission for every plugin would
add noise without meaningful protection.

If needed later, the platform can add a plugin-declared capability such as
`<pluginId>:share` for plugin-specific flows. The directory surface itself
remains generic.

### Invite-by-email helper

Searching existing users is not enough for plugins that want to invite someone
who is not yet registered. A second phase may add:

```ts
sdk.directory.createInvite(input: {
  email: string;
  reason: string;
  metadata?: unknown;
}): Promise<{ inviteId: string }>;
```

This is deferred. It touches auth invites, mail delivery, account activation,
and abuse controls. Phase 1 supports existing-user selection only.

### UI primitive

`@sovereignfs/ui` should eventually expose a reusable user picker:

- async search;
- selected-user chips;
- empty and loading states;
- keyboard navigation;
- avatar/name/email display;
- no direct role labels.

Plugins may build local pickers before the shared primitive exists, but they
should call the same SDK surface.

## Security and privacy

- Directory calls require an authenticated session.
- Results are tenant-scoped.
- The API returns display-safe profile data only.
- Search is rate-limited per user and IP.
- Queries shorter than 2 characters are rejected.
- Inactive users are not returned.
- Admin-only data remains behind Console/admin APIs.

## Alternatives considered

### Let plugins call admin user routes

Rejected. Admin routes expose management concepts and are not a plugin SDK
contract. They also assume admin privileges.

### Let each plugin maintain its own contacts table

Rejected as a replacement. Plugins may store membership rows, but the platform
must remain the source of truth for active users and display profile fields.

### Expose all users without search limits

Rejected. Most sharing flows need a picker, not a complete user dump. Bounded
search is safer and scales better.

## Open questions

1. Should user search match email for all users, or only users who have opted
   into being discoverable by email?
2. Should plugins be able to search by exact email for invitation flows even
   when general email search is restricted?
3. Should `DirectoryUser` include verification level once RFC 0035 lands?
4. Should instance admins be able to disable plugin directory search entirely?

## Adoption path

1. Add runtime directory routes gated by session.
2. Add `sdk.directory.searchUsers()` and `resolveUsers()`.
3. Add rate limiting and tests.
4. Update plugin development docs with member-selection guidance.
5. Add shared user-picker UI primitive if enough plugins duplicate it.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
