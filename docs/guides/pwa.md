---
title: Install Sovereign as an app
description: Install a Sovereign instance as a PWA and enable app-like features including push notifications.
---

# Install Sovereign as an app

A production Sovereign instance is an installable Progressive Web App (PWA).
Installing it gives the workspace its own icon and app window, keeps it close to
your other apps, and enables platform features such as background push
notifications when the operator and device support them.

You install a specific **Sovereign instance**, not a global Sovereign app. The
icon always opens the instance URL you installed, and your account remains under
that instance's operator and policies.

## Before you begin

- Use the instance's public `https://` address. Installation, service workers,
  and Web Push require a secure connection in production.
- Confirm that you can sign in to the instance in the browser.
- Use a current browser and operating-system version.
- For push notifications, the operator must configure Web Push for the instance.
  If it is not configured, the push controls do not appear.

## Install on iPhone or iPad

Use Safari for the installation flow:

1. Open the Sovereign instance URL in **Safari**.
2. Sign in and confirm that the workspace loads.
3. Tap **Share** in Safari.
4. Choose **Add to Home Screen**.
5. Review the instance name and tap **Add**.
6. Leave Safari and open Sovereign from the new Home Screen icon.
7. Confirm that it opens in its own app window rather than a normal browser tab.

Web Push on iPhone and iPad requires iOS or iPadOS 16.4 or later and an installed
Home Screen PWA. Enable notifications from the installed app, not from the
original Safari tab.

## Install on Android

Use Chrome or another browser that supports PWA installation:

1. Open the Sovereign instance URL in the browser.
2. Sign in and confirm that the workspace loads.
3. Open the browser menu.
4. Choose **Install app** or **Add to Home screen**. The wording depends on the
   browser and device.
5. Confirm the installation.
6. Open Sovereign from the app launcher or Home Screen icon.
7. Confirm that it opens as a standalone app.

Some Android browsers show an installation prompt automatically. Dismissed
prompts can usually be opened again from the browser menu.

## Install on a desktop

Chrome and Edge can install a Sovereign instance on supported desktop systems:

1. Open and sign in to the instance.
2. Select the install action in the address bar, or open the browser menu and
   choose **Install Sovereign**.
3. Confirm the installation.
4. Launch Sovereign from the operating system's application menu or dock.

The exact wording and location of the install action depend on the browser.

## Enable push notifications

Push is opt-in for each device. Installing on one phone or computer does not
subscribe your other devices.

1. Open the installed Sovereign app on the device you want to subscribe.
2. Open **Account** from the workspace.
3. Select the **Notifications** tab.
4. Under **Push notifications**, select **Enable push notifications**.
5. When the operating system or browser asks for permission, choose **Allow**.
6. Return to the Notifications page and confirm that it says push notifications
   are enabled on this device.

Notifications can now appear even when the app is not open. Selecting a
notification opens or focuses the relevant Sovereign page.

Do not deny the permission prompt as a test. Browsers often require notification
permission to be restored manually in site or operating-system settings after it
has been denied.

## Control notification behavior

The **Account → Notifications** page also provides:

- **Muted categories:** Discard selected notification categories before they
  create toasts, bell badges, or push alerts. Security notifications cannot be
  muted.
- **Poll interval:** Control how frequently an open browser checks for new
  notifications when the instance uses polling.
- **Disable push on this device:** Remove the current device's browser
  subscription and stop background delivery to it.

The in-app notification bell continues to work when push is unavailable or not
enabled.

## App-like behavior and limits

When installed, Sovereign uses a standalone window, mobile safe-area handling,
touch-friendly navigation, app shortcuts, and a service worker. If connectivity
is lost, the workspace shows an offline state and reloads when the connection
returns.

Sovereign is not fully offline-first. The service worker can show a reliable
offline fallback, but apps generally require the instance server for current
data, authentication, and mutations. Do not assume that work performed without
a connection will be stored or synchronized unless the individual app explicitly
documents that behavior.

## Updates

The installed PWA continues to use the operator's deployed instance. Updates are
delivered through that instance rather than an app store. After the operator
deploys a new release, close and reopen the app if the update does not appear
immediately.

If an update appears stuck:

1. Confirm the device is online.
2. Close every window for that Sovereign instance.
3. Reopen the installed app.
4. If the problem remains, remove and reinstall the PWA or clear that instance's
   website data. Clearing website data signs you out and removes the device's
   push subscription.

## Troubleshooting installation

### The install action does not appear

- Confirm the URL uses HTTPS and the instance loaded without certificate errors.
- Reload after the first successful visit so the service worker can register.
- Use Safari on iPhone or iPad and Chrome or Edge on supported Android and
  desktop systems.
- Ask the operator whether the production PWA assets and manifest are being
  served correctly.

### Push controls do not appear

The operator has probably not configured VAPID keys. The in-app bell remains
available. Contact the instance operator if background push is expected.

### Push permission was denied

Open the device's notification settings or the browser's site settings for the
instance and restore permission. Then return to **Account → Notifications** and
enable push again.

### Notifications are enabled but do not arrive

- Confirm notifications are allowed for the installed app at the OS level.
- Confirm the relevant category is not muted.
- On iOS, confirm the app was installed from Safari and opened from the Home
  Screen before subscribing.
- Ask the operator to verify VAPID configuration and push-delivery logs.
- Disable and re-enable push to replace a stale device subscription.

## Operator requirements

Operators should review [Web Push configuration in the self-hosting guide](/self-hosting#web-push-notifications-rfc-0016).
Production push requires a stable VAPID key pair and a real `VAPID_CONTACT` URI.
Rotating the key pair invalidates existing subscriptions and requires users to
subscribe again.

For release testing on physical devices, use the [real-device PWA testing guide](/pwa-real-device-testing).
