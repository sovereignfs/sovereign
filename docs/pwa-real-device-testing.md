# Real-device PWA testing

Sovereign is an installable PWA, so browser mobile emulation is not enough for
PWA-sensitive work. Chrome or Playwright mobile view can catch layout issues,
but it does not fully match an installed PWA on iPhone or Android.

iOS Safari and Home Screen PWAs differ in viewport sizing, safe-area handling,
service-worker behavior, cache state, standalone navigation, and notification
support. Android Chrome has its own install, cache, and notification behavior.
When a change touches the shell, auth/login flow, service worker, manifest,
offline behavior, push notifications, mobile layout, safe-area handling, or
install experience, test on a real device before deploy.

## What an AI agent can do

An AI agent can prepare and verify most of the test setup:

- run the production build and start command;
- expose the local app through a phone-reachable URL;
- verify browser-facing runtime/auth URLs do not point at `localhost`;
- provide the human with a concise device checklist;
- record the human's iPhone or Android observations in the PR notes.

An AI agent cannot fully validate installed-PWA behavior unless it has access to
a physical device, emulator with the relevant PWA support, or a real-device
cloud. If no device automation is available, the final installed-PWA check is a
human handoff.

## Preferred path: HTTPS tunnel

Use an HTTPS tunnel for realistic PWA checks. HTTPS is required for service
workers, installability, WebAuthn origin behavior, push notifications, and many
browser APIs outside `localhost`.

Build and start the app:

```bash
pnpm build
pnpm start
```

Expose the runtime with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

Or expose it with ngrok:

```bash
ngrok http 3000
```

Open the generated HTTPS URL on the phone, install the PWA from the browser,
then test the installed app from the Home Screen or app launcher.

## Fast path: local network URL

A local network URL is useful for quick mobile layout, touch, keyboard, and
safe-area checks. It is not a complete PWA test.

Find the development machine's LAN IP:

```bash
ipconfig getifaddr en0
```

Then open the app from the phone:

```text
http://<lan-ip>:3000
```

Use this path for quick checks only. Plain `http://192.168.x.x` usually does
not provide a secure context, so service workers, push notifications,
installability, and auth-origin behavior may not match production.

## Local HTTPS on LAN

Local HTTPS on the LAN avoids a third-party tunnel, but it takes more setup:

- generate a trusted local certificate;
- serve the runtime over HTTPS;
- make the phone trust the certificate;
- configure browser-facing runtime and auth URLs to the HTTPS LAN origin.

Use this when tunnel services are unavailable or when testing must stay entirely
on the local network.

## Auth and runtime URL checks

For shell/install/cache checks, a single runtime tunnel may be enough. For
login/session testing, the auth server must also be reachable from the phone.
Do not leave browser-facing URLs pointed at `localhost`, because that resolves
on the phone, not on the development machine.

Check the relevant environment variables before handing the test to a device:

- `NEXT_PUBLIC_RUNTIME_URL`
- `SOVEREIGN_AUTH_PUBLIC_URL`
- `SOVEREIGN_AUTH_URL`
- `AUTH_BASE_URL`
- `AUTH_WEBAUTHN_ORIGIN`

These should use phone-reachable HTTPS origins for full installed-PWA testing.

## Device checklist

Run this checklist on each real device used for validation:

- Install from Safari on iOS or Chrome on Android.
- Launch from the Home Screen or app launcher, not only the browser tab.
- Confirm the app opens in standalone PWA mode.
- Confirm login stays inside the PWA instead of opening a separate browser tab.
- Check safe areas: top header, bottom navigation, overlays, and keyboard-open
  states.
- Navigate between Launcher, Account, Console/admin-only surfaces, and a normal
  plugin.
- Background and resume the PWA.
- Toggle offline/online or airplane mode and verify the offline banner and
  reload behavior.
- For cache or service-worker changes, verify both a fresh install and an
  upgrade from a previously installed version.
- For push-notification changes, verify permission request, subscription,
  delivery, tap behavior, and denied-permission behavior.

Record the device model, OS version, browser, app URL, and any platform-specific
differences.

## Resetting iPhone PWA state

When testing cache or service-worker changes on iPhone, reset app state between
runs:

1. Delete the Home Screen PWA.
2. Open **Settings -> Safari -> Advanced -> Website Data**.
3. Delete the tested domain's website data.
4. Reopen the URL in Safari and reinstall the PWA.

This gives a cleaner install/cache state than deleting the Home Screen icon
alone.
