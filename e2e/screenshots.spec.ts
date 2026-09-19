import { test } from '@playwright/test'
import {
  captureScreenshot,
  createMockScreenlyForScreenshots,
  RESOLUTIONS,
} from '@screenly/edge-apps/test/screenshots'

const BASE_SETTINGS = {
  wifi_ssid: 'Screenly Guest',
  wifi_password: 'welcome2screenly',
  wifi_security: 'WPA',
  wifi_hidden: 'false',
  locale: 'en',
}

const { screenlyJsContent: passwordHiddenJsContent } =
  createMockScreenlyForScreenshots(
    {},
    { ...BASE_SETTINGS, wifi_show_password: 'false' },
  )

const { screenlyJsContent: passwordVisibleJsContent } =
  createMockScreenlyForScreenshots(
    {},
    { ...BASE_SETTINGS, wifi_show_password: 'true' },
  )

for (const { width, height } of RESOLUTIONS) {
  test(`screenshot ${width}x${height}`, async ({ browser }) => {
    await captureScreenshot(browser, {
      width,
      height,
      filenamePrefix: 'qr-wifi-app',
      screenlyJsContent: passwordHiddenJsContent,
    })
  })

  test(`screenshot with password ${width}x${height}`, async ({ browser }) => {
    await captureScreenshot(browser, {
      width,
      height,
      filenamePrefix: 'qr-wifi-app-with-password',
      screenlyJsContent: passwordVisibleJsContent,
    })
  })
}
