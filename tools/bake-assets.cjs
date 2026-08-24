/**
 * Dev-only asset bakery: renders tools/render-studio.html in Chromium and
 * exports every canvas board as a PNG (alpha preserved), then builds a
 * contact sheet for review. Run tools/postprocess.py afterwards to produce
 * the final trimmed/resized WebP files in assets/.
 *
 *   python3 -m http.server 8123   # from the repo root
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/bake-assets.cjs \
 *     [url] [outDir]
 */

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const url = process.argv[2] ?? 'http://localhost:8123/tools/render-studio.html';
const outDir = process.argv[3] ?? path.join(__dirname, '..', 'assets', 'raw-bake');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  // the studio flips this once its async boards (mascots, logo, icon) finish
  await page.waitForFunction('window.__bakeReady === true', { timeout: 30000 });

  const ids = await page.$$eval('canvas[id^="asset-"]', (els) => els.map((el) => el.id));
  for (const id of ids) {
    const name = id.replace(/^asset-/, '');
    const dataUrl = await page.$eval(`#${id}`, (canvas) => canvas.toDataURL('image/png'));
    const base64 = dataUrl.split(',')[1];
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(base64, 'base64'));
    console.log(`baked ${name}.png`);
  }

  await browser.close();
  if (errors.length) {
    console.error('PAGE ERRORS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`OK — ${ids.length} assets in ${outDir}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
