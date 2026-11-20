// Erzeugt die App-Icons aus scripts/icon.svg (benötigt Playwright/Chromium).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
import { readFileSync } from 'node:fs';
const svg = readFileSync('scripts/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const size of [180, 192, 512, 1024]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `www/icons/icon-${size}.png`, omitBackground: false });
  await page.close();
}
await browser.close();
console.log('Icons erstellt');
