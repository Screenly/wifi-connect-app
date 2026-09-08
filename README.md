# Wi-Fi QR Share

Instantly share Wi-Fi credentials on your digital signage screens with this lightweight QR code generator for Screenly Edge Apps.

Guests scan the on-screen QR code with their phone camera to join the network automatically — no typing required. The network name and password are also shown in large text as a fallback for people who'd rather type them in by hand.

## Getting Started

Install dependencies:

```bash
npm install
```

## Development

```bash
npm run dev
```

Set `wifi_ssid` / `wifi_password` / `wifi_security` / `wifi_hidden` in `mock-data.yml` (or `screenly.yml`'s `default_value`s) to preview real-looking data locally.

The layout is written in plain, responsive CSS (flexbox, `clamp()`, and orientation media queries) rather than the library's `<auto-scaler>`/`<app-header>` components, so it fills the full screen at any resolution without extra chrome.

## Build

```bash
npm run build
```

## Deployment

```bash
screenly edge-app create --name qr-wifi-app --in-place
npm run deploy
screenly edge-app instance create
```

## Configuration

| Setting         | Description                                                              | Required | Default |
| --------------- | ------------------------------------------------------------------------ | -------- | ------- |
| `wifi_ssid`     | The Wi-Fi network name shown on screen and encoded in the QR code        | Yes      | —       |
| `wifi_password` | The Wi-Fi password (stored as a secret). Leave blank for an open network | No       | —       |
| `wifi_security` | Network encryption: `WPA` (WPA/WPA2/WPA3), `WEP`, or `nopass` (open)     | No       | `WPA`   |

Advanced settings:

| Setting       | Description                                                                           | Required | Default |
| ------------- | ------------------------------------------------------------------------------------- | -------- | ------- |
| `wifi_hidden` | Set to `true` if the network doesn't broadcast its SSID                               | No       | `false` |
| `locale`      | Language for the on-screen text (`en`, `fr`, `de`, `es`, `pt`; falls back to English) | No       | `en`    |
| `sentry_dsn`  | Sentry Client Key for error capturing                                                 | No       | —       |

When `wifi_security` is `nopass`, or `wifi_password` is left blank, the app renders an open-network QR code and swaps the password display for an "Open network" badge instead.

## Screenshots

```bash
npm run screenshots
```
