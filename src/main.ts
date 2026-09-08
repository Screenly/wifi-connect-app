import './style.css'
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

interface Translation {
  eyebrow: string
  passwordLabel: string
  openNetwork: string
}

const TRANSLATIONS: Record<string, Translation> = {
  en: {
    eyebrow: 'Scan to join the network',
    passwordLabel: 'Password',
    openNetwork: 'Open network – no password needed',
  },
  fr: {
    eyebrow: 'Scannez pour rejoindre le réseau',
    passwordLabel: 'Mot de passe',
    openNetwork: 'Réseau ouvert – aucun mot de passe requis',
  },
  de: {
    eyebrow: 'Scannen, um dem Netzwerk beizutreten',
    passwordLabel: 'Passwort',
    openNetwork: 'Offenes Netzwerk – kein Passwort erforderlich',
  },
  es: {
    eyebrow: 'Escanea para unirte a la red',
    passwordLabel: 'Contraseña',
    openNetwork: 'Red abierta – no se necesita contraseña',
  },
  pt: {
    eyebrow: 'Escaneie para entrar na rede',
    passwordLabel: 'Senha',
    openNetwork: 'Rede aberta – nenhuma senha necessária',
  },
}

function resolveTranslation(locale: string): Translation {
  const language = locale.trim().toLowerCase().split(/[-_]/)[0]
  return TRANSLATIONS[language] ?? TRANSLATIONS.en
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

async function renderQRCode(payload: string): Promise<void> {
  const container = document.getElementById('qr-code')!
  container.innerHTML = await QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 0,
    color: {
      dark: '#0b0a17',
      light: '#ffffff',
    },
  })
}

function renderCredentials(
  { ssid, password, security }: WifiCredentials,
  translation: Translation,
) {
  document.getElementById('ssid')!.textContent = ssid
  document.getElementById('eyebrow')!.textContent = translation.eyebrow
  document.getElementById('password-label')!.textContent =
    translation.passwordLabel
  document.getElementById('open-badge-text')!.textContent =
    translation.openNetwork

  const passwordRow = document.getElementById('password-row')!
  const openBadge = document.getElementById('open-badge')!
  const isOpen = security === 'nopass' || !password

  if (isOpen) {
    passwordRow.hidden = true
    openBadge.hidden = false
  } else {
    document.getElementById('password')!.textContent = password
    passwordRow.hidden = false
    openBadge.hidden = true
  }
}

async function render(): Promise<void> {
  setupErrorHandling()
  setupTheme()

  const credentials: WifiCredentials = {
    ssid: getSettingWithDefault<string>('wifi_ssid', 'Screenly Guest Wi-Fi'),
    password: getSettingWithDefault<string>('wifi_password', ''),
    security: getSettingWithDefault<string>('wifi_security', 'WPA'),
    hidden: getSettingWithDefault<string>('wifi_hidden', 'false') === 'true',
  }
  const locale = getSettingWithDefault<string>('locale', 'en')
  const translation = resolveTranslation(locale)

  document.documentElement.lang = locale.trim().split(/[-_]/)[0] || 'en'
  renderCredentials(credentials, translation)
  await renderQRCode(buildWifiPayload(credentials))

  signalReady()
}

document.addEventListener('DOMContentLoaded', () => {
  void render()
})
