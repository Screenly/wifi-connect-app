import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Playwright owns e2e/ (its own test() runner); keep Vitest to src/.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
