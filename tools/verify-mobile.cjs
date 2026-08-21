/**
 * Dev-only mobile verification: drives the game in headless Chromium with
 * phone emulation (iPhone-13-like), walks menu → levels → game, checks the
 * board actually painted, plays a hinted move via touch when playback is
 * wired, and saves screenshots OUTSIDE the repo.
 *
 * Run:
 *   python3 -m http.server 8123   # from the repo root, separately
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/verify-mobile.cjs \
 *     [url] [shotDir]
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright');

const url = process.argv[2] ?? 'http://localhost:8123';
const shotDir = process.argv[3] ?? path.join(os.tmpdir(), 'candy-claus-shots');

(async () => {
  fs.mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  const shot = (name) => page.screenshot({ path: path.join(shotDir, `${name}.png`) });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await shot('1-menu');

  await page.tap('#btn-play');
  await page.waitForSelector('#screen-levels.active');
  await page.waitForTimeout(350);
  await shot('2-levels');

  await page.tap('.level-cell:not(.locked)');
  await page.waitForSelector('#screen-game.active');
  await page.waitForTimeout(600);

  // The canvas must have real pixels on it (not a blank board).
  const painted = await page.$eval('#board', (canvas) => {
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 10) lit++;
    }
    return { lit, total: data.length / 4, w: canvas.width, h: canvas.height };
  });
  if (painted.lit < painted.total * 0.3) {
    throw new Error(`board looks blank: ${painted.lit}/${painted.total} px lit`);
  }
  await shot('3-game');

  // Hint wobble should not crash and the pause dialog should open.
  await page.tap('#btn-hint');
  await page.waitForTimeout(400);
  await page.tap('#btn-pause');
  await page.waitForSelector('.dialog-root.open');
  await page.waitForTimeout(350);
  await shot('4-pause');
  await page.tap('[data-action="resume"]');
  await page.waitForTimeout(400);

  // Touch-play a move once input+playback are wired (guarded: no-op before).
  const wired = await page.evaluate(() => Boolean(window.__candy?.playHintMove));
  if (wired) {
    const before = await page.textContent('#hud-score');
    await page.evaluate(() => window.__candy.playHintMove());
    await page.waitForTimeout(400);
    await shot('5-mid-move'); // pops, particles, floating score in flight
    await page.waitForFunction(
      (prev) => document.getElementById('hud-score').textContent !== prev,
      before,
      { timeout: 8000 },
    );
    await page.waitForFunction(() => !window.__candy.isLocked(), { timeout: 15000 });
    await page.waitForTimeout(400);
    await shot('6-after-move');
    console.log(`score changed: ${before} → ${await page.textContent('#hud-score')}`);

    // Real touch path: tap-tap the two hint cells through pointer events.
    const cells = await page.evaluate(() => window.__candy.hintScreenCells());
    if (cells) {
      const scoreBefore = await page.textContent('#hud-score');
      await page.touchscreen.tap(cells.from.x, cells.from.y);
      await page.waitForTimeout(120);
      await page.touchscreen.tap(cells.to.x, cells.to.y);
      await page.waitForFunction(
        (prev) => document.getElementById('hud-score').textContent !== prev,
        scoreBefore,
        { timeout: 8000 },
      );
      await page.waitForFunction(() => !window.__candy.isLocked(), { timeout: 15000 });
      console.log(
        `tap-tap move: ${scoreBefore} → ${await page.textContent('#hud-score')}`,
      );
    } else {
      console.log('no hint available for the tap-tap test');
    }
  } else {
    console.log('input/playback not wired yet — skipped the move test');
  }

  await browser.close();
  if (errors.length) {
    console.error('PAGE ERRORS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`OK — screenshots in ${shotDir}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
