# Wi-Fi QR Share

![1080p Screenshot](/screenshots/qr-wifi-app-1920x1080.webp)

Instantly share Wi-Fi credentials on your digital signage screens with this lightweight QR code generator for Screenly Edge Apps.

Guests scan the on-screen QR code with their phone camera to join the network automatically. The network name is shown as text for identification, but the password itself is hidden by default — scanning the QR is the only way to connect, so it can't be read off the screen (or a photo of it) by anyone without their own phone in hand. Turn on `wifi_show_password` if guests should also be able to type the password in by hand.

## Getting Started

Install dependencies:

```bash
bun install
```

## Development

```bash
bun run dev
```

Set `wifi_ssid` / `wifi_password` / `wifi_security` / `wifi_hidden` in `mock-data.yml` (or `screenly.yml`'s `default_value`s) to preview real-looking data locally.

The layout is written in plain, responsive CSS (flexbox, `clamp()`, and orientation media queries) rather than the library's `<auto-scaler>`/`<app-header>` components, so it fills the full screen at any resolution without extra chrome.

The card background is a fixed dark overlay rather than one that lightens with the operator's `screenly_color_accent` — a pale or near-white accent used to wash out the card and drag text contrast down with it. All on-screen text is verified at WCAG AAA (≥7:1) against every accent color from near-black to near-white, since signage is typically viewed from a distance and often in bright ambient light where marginal contrast reads as illegible.

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

| Setting         | Description                                                              | Required | Default |
| --------------- | ------------------------------------------------------------------------ | -------- | ------- |
| `wifi_ssid`     | The Wi-Fi network name shown on screen and encoded in the QR code        | Yes      | —       |
| `wifi_password` | The Wi-Fi password (stored as a secret). Leave blank for an open network | No       | —       |
| `wifi_security` | Network encryption: `WPA` (WPA/WPA2/WPA3), `WEP`, or `nopass` (open)     | No       | `WPA`   |

Advanced settings:

| Setting              | Description                                                                           | Required | Default |
| -------------------- | ------------------------------------------------------------------------------------- | -------- | ------- |
| `wifi_hidden`        | Set to `true` if the network doesn't broadcast its SSID                               | No       | `false` |
| `wifi_show_password` | Also display the password as text on screen, for typing in by hand                    | No       | `false` |
| `sentry_dsn`         | Sentry Client Key for error capturing                                                 | No       | —       |
| `locale`             | Language for the on-screen text (`en`, `fr`, `de`, `es`, `pt`; falls back to English) | No       | `en`    |

By default the password is only ever embedded in the QR code, never rendered as text — set `wifi_show_password` to `true` to also show it. When `wifi_security` is `nopass`, or `wifi_password` is left blank, the app always renders an open-network QR code and shows an "Open network" badge instead, regardless of `wifi_show_password` (there's no password to show).

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

Before these can actually deploy, each environment needs to be set up once in the repo (Settings → Environments → `stage` / `production`), with a `SCREENLY_API_TOKEN` secret. Then run **Initialize Edge App** once per environment (this creates the Edge App and instance and writes the returned `id` into `screenly_qc.yml` for stage or `screenly.yml` for production — commit that `id` back so **Update Edge App** can find it on subsequent deploys).
