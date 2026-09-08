import { test } from '@playwright/test'
import {
  captureScreenshot,
  createMockScreenlyForScreenshots,
  RESOLUTIONS,
} from '@screenly/edge-apps/test/screenshots'

const { screenlyJsContent } = createMockScreenlyForScreenshots(
  {},
  {
    wifi_ssid: 'Screenly Guest',
    wifi_password: 'welcome2screenly',
    wifi_security: 'WPA',
    wifi_hidden: 'false',
  },
)

for (const { width, height } of RESOLUTIONS) {
  test(`screenshot ${width}x${height}`, async ({ browser }) => {
    await captureScreenshot(browser, {
      width,
      height,
      filenamePrefix: 'qr-wifi-app',
      screenlyJsContent,
    })
  })
}
