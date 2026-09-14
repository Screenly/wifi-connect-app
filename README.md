# Wi-Fi QR Share

![1080p Screenshot](/screenshots/qr-wifi-app-1920x1080.webp)

Instantly share Wi-Fi credentials on your digital signage screens with this lightweight QR code generator for Screenly Edge Apps.

Guests scan the on-screen QR code with their phone camera to join the network automatically. The network name and, by default, the password are also shown as text for guests who'd rather type them in by hand. Turn off `wifi_show_password` if the password should only be readable by scanning the QR code — that's the only way to connect either way — rather than by anyone glancing at or photographing the screen.

## Getting Started

Install dependencies:

```bash
bun install
```

## Development

```bash
bun run dev
```

Set any setting (e.g. `wifi_ssid` / `wifi_password` / `wifi_security` / `wifi_hidden` / `bg_color` / `text_color`) in `mock-data.yml` (or `screenly.yml`'s `default_value`s) to preview real-looking data locally.

The layout is written in plain, responsive CSS (flexbox, `clamp()`, and orientation media queries) rather than the library's `<auto-scaler>`/`<app-header>` components, so it fills the full screen at any resolution without extra chrome.

The card's accent color still follows the operator's `screenly_color_accent`, but the background and text colors are independent settings (`bg_color` / `text_color`, defaulting to near-black and white) rather than derived from it — a pale or near-white accent used to wash out the card and drag text contrast down with it when they were tied together. Both accept a hex code or a CSS color name, and fall back to their defaults if unparseable. A lightweight guard only overrides `text_color` when it's close enough to `bg_color` to be effectively invisible (e.g. white text on a white background) — any other pairing, however low-contrast by strict accessibility standards, is left to the operator's own judgment.

The SSID renders on a single line at any length up to the 32-character Wi-Fi limit — `fitSsidFontSize()` in `src/main.ts` shrinks its font size (measured against the actual rendered width, re-run on resize/rotation) rather than letting it wrap or overflow. The header pill (`wifi_header_message`) instead truncates with an ellipsis past 60 characters, since it's a supporting label rather than the card's focal point.

## Build

```bash
bun run build
```

## Deployment

Deployment is handled by CI (see below), not run by hand. `bun run deploy` remains available for local one-off pushes:

```bash
bun run deploy
```

## Configuration

| Setting               | Description                                                                      | Required | Default        |
| --------------------- | -------------------------------------------------------------------------------- | -------- | -------------- |
| `wifi_ssid`           | The Wi-Fi network name shown on screen and encoded in the QR code                | Yes      | —              |
| `wifi_header_message` | Message shown in the pill at the top of the screen. Truncated past 60 characters | No       | `WiFi Details` |
| `wifi_password`       | The Wi-Fi password (stored as a secret). Leave blank for an open network         | No       | —              |
| `wifi_security`       | Network encryption: `WPA` (WPA/WPA2/WPA3), `WEP`, or `nopass` (open)             | No       | `WPA`          |

Advanced settings:

| Setting              | Description                                                                            | Required | Default   |
| -------------------- | -------------------------------------------------------------------------------------- | -------- | --------- |
| `wifi_hidden`        | Set to `true` if the network doesn't broadcast its SSID                                | No       | `false`   |
| `wifi_show_password` | Also display the password as text on screen, for typing in by hand                     | No       | `true`    |
| `bg_color`           | Screen background color — a hex code (e.g. `#08060f`) or CSS color name (e.g. `black`) | No       | `#08060f` |
| `text_color`         | On-screen text color — a hex code (e.g. `#ffffff`) or CSS color name (e.g. `white`)    | No       | `#ffffff` |
| `sentry_dsn`         | Sentry Client Key for error capturing                                                  | No       | —         |
| `locale`             | Language for the on-screen text (`en`, `fr`, `de`, `es`, `pt`; falls back to English)  | No       | `en`      |

`wifi_show_password` controls whether the password is also rendered as text — on by default; turn it off so the password is only ever embedded in the QR code, never shown on screen. When `wifi_security` is `nopass`, or `wifi_password` is left blank, the app always renders an open-network QR code and shows an "Open network" badge instead, regardless of `wifi_show_password` (there's no password to show).

`bg_color` and `text_color` fall back to their defaults if unparseable, and `text_color` automatically switches to black or white if the chosen pair would otherwise be indistinguishable from the background.

## Testing

```bash
bun run test
```

## Screenshots

```bash
bun run screenshots
```

This generates WebP screenshots for all 10 supported Screenly resolutions into the `screenshots/` directory, using [`@screenly/edge-apps/test/screenshots`](https://github.com/Screenly/edge-apps-library#screenshot-testing) to mock `screenly.js` and Playwright to capture each one — once with `wifi_show_password` off (`qr-wifi-app-*.webp`) and once with it on (`qr-wifi-app-with-password-*.webp`), so both states stay visually reviewable.

## CI/CD

This repo follows the same [`Screenly/edge-apps-actions`](https://github.com/Screenly/edge-apps-actions) workflow used across Screenly's Edge Apps:

- **[Checks](.github/workflows/checks.yml)** — runs on every push/PR to `development` and `main`: format check, lint, build, test.
- **[Update Edge App](.github/workflows/update-edge-app.yml)** — deploys to **stage** on push to `development` (or manual dispatch), and to **production** on push to `main`.
- **[Initialize Edge App](.github/workflows/initialize-edge-app.yml)** — one-off, manually triggered (`workflow_dispatch`) to register a brand-new Edge App + instance in `stage` or `production`.

Before these can actually deploy, each environment needs to be set up once in the repo (Settings → Environments → `stage` / `production`), with a `SCREENLY_API_TOKEN` secret. This app identifies its Edge App via the `edge_app_id` input on both workflows (pinned to a specific `edge-apps-actions` commit ahead of its next tagged release, matching [`Screenly/airtable-app#16`](https://github.com/Screenly/airtable-app/pull/16) and [`Screenly/3d-text-app`](https://github.com/Screenly/3d-text-app)) — sourced from an `EDGE_APP_ID` secret, falling back to `STAGE_EDGE_APP_ID` / `PRODUCTION_EDGE_APP_ID` repo variables per environment — rather than an id committed into the manifest, so there's a single `screenly.yml` shared by both environments instead of a separate `screenly_qc.yml` for stage.

Set `STAGE_EDGE_APP_ID` and `PRODUCTION_EDGE_APP_ID` (Settings → Secrets and variables → Actions → Variables) to each environment's Edge App id before running **Initialize Edge App** or **Update Edge App** — get the id either from the Screenly dashboard for an existing Edge App, or from **Initialize Edge App**'s output when registering a new one.
