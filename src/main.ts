import QRCode from 'qrcode'
import {
  getSettingWithDefault,
  setupErrorHandling,
  setupTheme,
  signalReady,
} from '@screenly/edge-apps'

// Characters that need escaping inside a WIFI: URI value, per the format
// used by most QR scanners: backslash, semicolon, comma, double quote, colon.
const WIFI_SPECIAL_CHARS = /([\\;,":])/g

function escapeWifiValue(value: string): string {
  return value.replace(WIFI_SPECIAL_CHARS, '\\$1')
}

const DEFAULT_BG_COLOR = '#08060f'
const DEFAULT_TEXT_COLOR = '#ffffff'

// Deliberately far below WCAG's 3:1/4.5:1 legibility floors — this only
// exists to catch a background/text pair that's effectively the same color
// (identical, or a shade apart), not to enforce general accessible contrast.
// An operator is free to pick a low-contrast-but-distinct pair like blue
// text on green; 1.67:1 clears this bar even though it fails WCAG AA.
const MIN_CONTRAST_RATIO = 1.2

function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const digits = match[1]
  const expanded =
    digits.length === 3
      ? digits.replace(/./g, (digit) => digit + digit)
      : digits
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ]
}

function clampChannel(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)))
}

function rgbToHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

// Complete rgb()/rgba() only — not end-anchored matching would accept
// `rgb(255, 0, 0)junk` and treat it as valid. Channels are clamped to
// 0–255 so out-of-range values can't produce NaN luminance.
function parseRgbString(value: string): [number, number, number] | null {
  const match =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(
      value.trim(),
    )
  if (!match) return null
  const red = Number(match[1])
  const green = Number(match[2])
  const blue = Number(match[3])
  if (![red, green, blue].every(Number.isFinite)) return null
  return [clampChannel(red), clampChannel(green), clampChannel(blue)]
}

// Accepts hex and rgb()/rgba() directly, then hands anything else (CSS
// named colors like "red" or "cornflowerblue", hsl(), etc.) to the browser's
// own color parser rather than maintaining a list of ~150 color names.
// Canvas's fillStyle setter silently ignores a value it can't parse, so
// seeding it with a sentinel first and checking whether it changed is a
// reliable way to ask "did that parse?" without a real DOM element.
function parseCssColor(value: string): [number, number, number] | null {
  const trimmed = value.trim()
  const direct = parseHexColor(trimmed) ?? parseRgbString(trimmed)
  if (direct) return direct

  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  const sentinel = '#010203'
  ctx.fillStyle = sentinel
  ctx.fillStyle = trimmed
  const resolved = ctx.fillStyle
  if (resolved === sentinel) return null
  return parseHexColor(resolved) ?? parseRgbString(resolved)
}

function relativeLuminance([red, green, blue]: [
  number,
  number,
  number,
]): number {
  const toLinear = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
  )
}

// Relative luminance above which black text reads better than white — same
// threshold @screenly/edge-apps' isLightColor() uses internally, restated
// here because that helper doesn't parse named colors.
const LIGHT_LUMINANCE_THRESHOLD = 0.179

// WCAG contrast ratio between two CSS colors, from 1 (identical) to 21
// (black on white). Returns null if either color can't be parsed.
function contrastRatio(colorA: string, colorB: string): number | null {
  const rgbA = parseCssColor(colorA)
  const rgbB = parseCssColor(colorB)
  if (!rgbA || !rgbB) return null
  const luminanceA = relativeLuminance(rgbA)
  const luminanceB = relativeLuminance(rgbB)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

// bg_color and text_color are independent free-text settings (hex,
// rgb(), or a CSS color name), so operators can land on an invalid value or
// pick the same color (or near enough) for both, making the text invisible.
// Fall back to the defaults for anything unparsable, and — only when the
// pair is that close — force the text to whichever of black/white contrasts
// more with the background. Distinct-but-low-contrast pairs (e.g. blue text
// on green) are left alone; that's the operator's call, not ours.
function resolveColors(
  bgSetting: string,
  textSetting: string,
): { bg: string; text: string } {
  const bgRgb = parseCssColor(bgSetting)
  const bg = bgRgb ? rgbToHex(bgRgb) : DEFAULT_BG_COLOR
  const textRgb = parseCssColor(textSetting)
  let text = textRgb ? rgbToHex(textRgb) : DEFAULT_TEXT_COLOR

  const ratio = contrastRatio(bg, text)
  if (ratio === null || ratio < MIN_CONTRAST_RATIO) {
    const bgLuminance = relativeLuminance(
      bgRgb ?? parseHexColor(DEFAULT_BG_COLOR)!,
    )
    text = bgLuminance > LIGHT_LUMINANCE_THRESHOLD ? '#000000' : '#ffffff'
  }

  return { bg, text }
}

function mixHex(hexA: string, hexB: string, weightA: number): string {
  const rgbA = parseHexColor(hexA)
  const rgbB = parseHexColor(hexB)
  if (!rgbA || !rgbB) return hexA
  return `#${rgbA
    .map((channel, i) =>
      Math.round(channel * weightA + rgbB[i] * (1 - weightA))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

// --accent-tint/--accent-tint-2 in style.css are lightened versions of the
// operator's *global* Screenly accent color, tuned to read well against this
// app's original near-black background. Once bg_color lets an operator
// pick their own background, that tint can land anywhere — including
// matching the background closely enough to disappear. Guard each the same
// way as resolveColors: fall back to the already-safe `text` color only
// when the tint is that close to invisible, not merely low-contrast.
function resolveAccentTints(
  bg: string,
  accentColor: string,
  fallbackText: string,
): { tint: string; tint2: string } {
  const tint = mixHex(accentColor, '#ffffff', 0.3)
  const tint2 = mixHex(accentColor, '#ffffff', 0.5)
  const tintRatio = contrastRatio(bg, tint)
  const tint2Ratio = contrastRatio(bg, tint2)
  return {
    tint:
      tintRatio !== null && tintRatio >= MIN_CONTRAST_RATIO
        ? tint
        : fallbackText,
    tint2:
      tint2Ratio !== null && tint2Ratio >= MIN_CONTRAST_RATIO
        ? tint2
        : fallbackText,
  }
}

interface Translation {
  scanCaption: string
  passwordHint: string
  openNetwork: string
}

// The header badge's own default text lives in screenly.yml's
// wifi_header_message default_value (English only) rather than here — it's
// an operator-editable setting, not UI chrome, so it doesn't belong in a
// per-locale translation table.
const TRANSLATIONS: Record<string, Translation> = {
  en: {
    scanCaption: 'Scan to join',
    passwordHint: 'Or type the password',
    openNetwork: 'Open network – no password needed',
  },
  fr: {
    scanCaption: 'Scannez pour rejoindre',
    passwordHint: 'Ou saisissez le mot de passe',
    openNetwork: 'Réseau ouvert – aucun mot de passe requis',
  },
  de: {
    scanCaption: 'Scannen zum Beitreten',
    passwordHint: 'Oder Passwort eingeben',
    openNetwork: 'Offenes Netzwerk – kein Passwort erforderlich',
  },
  es: {
    scanCaption: 'Escanea para unirte',
    passwordHint: 'O escribe la contraseña',
    openNetwork: 'Red abierta – no se necesita contraseña',
  },
  pt: {
    scanCaption: 'Escaneie para entrar',
    passwordHint: 'Ou digite a senha',
    openNetwork: 'Rede aberta – nenhuma senha necessária',
  },
}

function resolveLanguage(locale: string): keyof typeof TRANSLATIONS {
  const language = locale.trim().toLowerCase().split(/[-_]/)[0]
  return language in TRANSLATIONS
    ? (language as keyof typeof TRANSLATIONS)
    : 'en'
}

// #badge-text in style.css ellipsizes with CSS alone, so arbitrarily long
// operator input can never overflow the pill — but relying on that solely
// means the visible cutoff point silently depends on font metrics and the
// player's resolution. 60 characters is measured to fit on one line even at
// 800x480, the smallest resolution Screenly players support
// (@screenly/edge-apps/test/screenshots' RESOLUTIONS), for realistic prose;
// truncating to that length up front keeps the cutoff point predictable
// instead of leaving it to wherever CSS happens to clip.
const MAX_HEADER_MESSAGE_LENGTH = 60
const MAX_SSID_LENGTH = 32

function truncateHeaderMessage(message: string): string {
  const trimmed = message.trim()
  if (trimmed.length <= MAX_HEADER_MESSAGE_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_HEADER_MESSAGE_LENGTH - 1).trimEnd()}…`
}

// IEEE 802.11 caps an SSID at 32 octets. The setting is free text, so
// slice to 32 characters (no ellipsis — that would change the network
// name) and use the same value on screen and in the QR payload.
function truncateSsid(ssid: string): string {
  return ssid.trim().slice(0, MAX_SSID_LENGTH)
}

interface WifiCredentials {
  ssid: string
  password: string
  security: string
  hidden: boolean
}

function buildWifiPayload({
  ssid,
  password,
  security,
  hidden,
}: WifiCredentials): string {
  const isOpen = security === 'nopass' || !password
  const segments = [
    `WIFI:T:${isOpen ? 'nopass' : security}`,
    `S:${escapeWifiValue(ssid)}`,
  ]

  if (!isOpen) {
    segments.push(`P:${escapeWifiValue(password)}`)
  }

  if (hidden) {
    segments.push('H:true')
  }

  return `${segments.join(';')};;`
}

const MIN_SSID_FONT_SIZE_PX = 16

// .ssid's CSS font-size is a clamp() tuned for typical SSID lengths, but
// names run up to 32 characters — long enough to overflow that size on the
// single line white-space: nowrap requires (see style.css). Shrink the font
// size in JS, starting from the CSS value, until the name fits.
function fitSsidFontSize(): void {
  const el = document.getElementById('ssid')!
  el.style.fontSize = ''
  if (el.scrollWidth <= el.clientWidth || el.clientWidth === 0) return
  const cssFontSize = parseFloat(getComputedStyle(el).fontSize)
  const scale = el.clientWidth / el.scrollWidth
  el.style.fontSize = `${Math.max(MIN_SSID_FONT_SIZE_PX, Math.floor(cssFontSize * scale))}px`
}

async function renderQRCode(payload: string): Promise<void> {
  const container = document.getElementById('qr-code')!
  container.innerHTML = await QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 0,
    color: {
      dark: '#08060f',
      light: '#ffffff',
    },
  })
}

// The QR code alone is enough to join a secured network, so
// `wifi_show_password` controls whether the password is *also* rendered as
// text on screen for guests who'd rather type it in by hand. It defaults to
// on; operators who want the password readable only by scanning (not by
// anyone glancing at or photographing the screen) can turn it off.
function renderCredentials(
  { ssid, password, security }: WifiCredentials,
  translation: Translation,
  showPassword: boolean,
  headerMessage: string,
) {
  document.getElementById('ssid')!.textContent = ssid
  document.getElementById('badge-text')!.textContent = headerMessage
  document.getElementById('qr-caption')!.textContent = translation.scanCaption
  document.getElementById('open-badge-text')!.textContent =
    translation.openNetwork

  const isOpen = security === 'nopass' || !password
  document.getElementById('open-badge')!.hidden = !isOpen

  const passwordRow = document.getElementById('password-row')!
  const shouldShowPassword = showPassword && !isOpen
  passwordRow.hidden = !shouldShowPassword
  if (shouldShowPassword) {
    document.getElementById('password-label')!.textContent =
      translation.passwordHint
    document.getElementById('password')!.textContent = password
  }

  // The divider only makes sense alongside a visible password. In the
  // landscape row it also just falls away with the password block — the
  // QR block is left alone and .card's align-items: center re-centers it.
  document.getElementById('divider')!.hidden = !shouldShowPassword

  // Portrait rebuilds the row into a grid (see the orientation: portrait
  // block in style.css) with a reserved password row so the QR above it
  // stays put for typical passwords between the shown/hidden states.
  // Which state applies decides both the grid template and which element
  // lands in which row, so it's driven from here rather than duplicated
  // per-element hidden checks in CSS.
  const card = document.querySelector('.card')!
  card.classList.remove('state-open', 'state-password', 'state-no-password')
  card.classList.add(
    isOpen
      ? 'state-open'
      : shouldShowPassword
        ? 'state-password'
        : 'state-no-password',
  )
}

async function render(): Promise<void> {
  setupErrorHandling()
  const { primary: accentColor } = setupTheme()

  const credentials: WifiCredentials = {
    ssid: truncateSsid(
      getSettingWithDefault<string>('wifi_ssid', 'Screenly Guest Wi-Fi'),
    ),
    password: getSettingWithDefault<string>('wifi_password', ''),
    security: getSettingWithDefault<string>('wifi_security', 'WPA'),
    hidden: getSettingWithDefault<string>('wifi_hidden', 'false') === 'true',
  }
  const locale = getSettingWithDefault<string>('locale', 'en')
  const language = resolveLanguage(locale)
  const translation = TRANSLATIONS[language]
  const showPassword =
    getSettingWithDefault<string>('wifi_show_password', 'true') === 'true'
  const headerMessage = truncateHeaderMessage(
    getSettingWithDefault<string>('wifi_header_message', 'WiFi Details'),
  )
  const { bg, text } = resolveColors(
    getSettingWithDefault<string>('bg_color', DEFAULT_BG_COLOR),
    getSettingWithDefault<string>('text_color', DEFAULT_TEXT_COLOR),
  )
  const { tint, tint2 } = resolveAccentTints(bg, accentColor, text)
  document.documentElement.style.setProperty('--bg', bg)
  document.documentElement.style.setProperty('--ink', text)
  document.documentElement.style.setProperty('--accent-tint', tint)
  document.documentElement.style.setProperty('--accent-tint-2', tint2)

  document.documentElement.lang = language
  renderCredentials(credentials, translation, showPassword, headerMessage)
  fitSsidFontSize()
  void document.fonts.ready.then(fitSsidFontSize)
  await renderQRCode(buildWifiPayload(credentials))

  signalReady()
}

document.addEventListener('DOMContentLoaded', () => {
  void render()
})

// Refits the SSID on rotation/resize — the portrait media query in
// style.css changes both the clamp() ceiling and the available width.
window.addEventListener('resize', fitSsidFontSize)
