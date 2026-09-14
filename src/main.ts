import QRCode from 'qrcode'
import {
  getSettingWithDefault,
  isLightColor,
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

// WCAG's "large text" contrast floor (as opposed to the stricter 4.5:1 for
// body copy) — everything --ink paints here (the SSID, captions, password)
// renders well above that size threshold, so it's the right bar to guard
// against an operator picking a background/text pair that's unreadable.
const MIN_CONTRAST_RATIO = 3

function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const digits = match[1]
  const expanded =
    digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ]
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
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
}

// WCAG contrast ratio between two colors, from 1 (identical) to 21 (black on
// white). Returns null if either color isn't a hex string we can parse.
function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = parseHexColor(hexA)
  const rgbB = parseHexColor(hexB)
  if (!rgbA || !rgbB) return null
  const luminanceA = relativeLuminance(rgbA)
  const luminanceB = relativeLuminance(rgbB)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

// wifi_bg_color and wifi_text_color are independent free-text hex settings,
// so operators can land on an invalid value or a pairing that's too close to
// read. Fall back to the defaults for anything unparsable, and — if the
// resulting pair doesn't contrast enough — force the text to whichever of
// black/white contrasts more with the background rather than ship
// unreadable text to an unattended screen.
function resolveColors(
  bgSetting: string,
  textSetting: string,
): { bg: string; text: string } {
  const bg = parseHexColor(bgSetting) ? bgSetting : DEFAULT_BG_COLOR
  let text = parseHexColor(textSetting) ? textSetting : DEFAULT_TEXT_COLOR

  const ratio = contrastRatio(bg, text)
  if (ratio === null || ratio < MIN_CONTRAST_RATIO) {
    text = isLightColor(bg) ? '#000000' : '#ffffff'
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
// app's original near-black background. Once wifi_bg_color lets an operator
// pick their own background, that tint can land anywhere — a light accent on
// a light custom background is exactly as unreadable as the main bg/text
// pairing above. Guard each the same way: fall back to the already
// bg-safe `text` color when the tint alone wouldn't contrast enough.
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
    tint: tintRatio !== null && tintRatio >= MIN_CONTRAST_RATIO ? tint : fallbackText,
    tint2: tint2Ratio !== null && tint2Ratio >= MIN_CONTRAST_RATIO ? tint2 : fallbackText,
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

function resolveTranslation(locale: string): Translation {
  const language = locale.trim().toLowerCase().split(/[-_]/)[0]
  return TRANSLATIONS[language] ?? TRANSLATIONS.en
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

function truncateHeaderMessage(message: string): string {
  const trimmed = message.trim()
  if (trimmed.length <= MAX_HEADER_MESSAGE_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_HEADER_MESSAGE_LENGTH - 1).trimEnd()}…`
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

// Password is hidden from the UI by default — the QR code is enough to join
// a secured network, so leaving `wifi_show_password` off means the
// credential can't be read off the screen by anyone without their phone
// camera ready. Operators can opt in via that setting if guests should also
// be able to type the password in by hand.
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
  // block in style.css) with a fixed-height row reserved for the password
  // block so the QR above it never moves between the shown/hidden states.
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
    ssid: getSettingWithDefault<string>('wifi_ssid', 'Screenly Guest Wi-Fi'),
    password: getSettingWithDefault<string>('wifi_password', ''),
    security: getSettingWithDefault<string>('wifi_security', 'WPA'),
    hidden: getSettingWithDefault<string>('wifi_hidden', 'false') === 'true',
  }
  const locale = getSettingWithDefault<string>('locale', 'en')
  const translation = resolveTranslation(locale)
  const showPassword =
    getSettingWithDefault<string>('wifi_show_password', 'false') === 'true'
  const headerMessage = truncateHeaderMessage(
    getSettingWithDefault<string>(
      'wifi_header_message',
      'Welcome — Guest Wi-Fi',
    ),
  )
  const { bg, text } = resolveColors(
    getSettingWithDefault<string>('wifi_bg_color', DEFAULT_BG_COLOR),
    getSettingWithDefault<string>('wifi_text_color', DEFAULT_TEXT_COLOR),
  )
  const { tint, tint2 } = resolveAccentTints(bg, accentColor, text)
  document.documentElement.style.setProperty('--bg', bg)
  document.documentElement.style.setProperty('--ink', text)
  document.documentElement.style.setProperty('--accent-tint', tint)
  document.documentElement.style.setProperty('--accent-tint-2', tint2)

  document.documentElement.lang = locale.trim().split(/[-_]/)[0] || 'en'
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
