const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3010', viewport: { width: 1440, height: 900 }, launchOptions: { channel: 'chrome' } },
  webServer: { command: 'npm start', env: {PORT:'3010'}, url: 'http://127.0.0.1:3010', reuseExistingServer: false, timeout: 120000 },
});
