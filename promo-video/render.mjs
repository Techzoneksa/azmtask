// Renders index.html frame-by-frame to JPEGs for ffmpeg encoding.
// Usage: node render.mjs <outDir> [fps] [--preview t1,t2,...]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || join(here, 'frames');
const fps = parseFloat(process.argv[3] || '30');
const previewIdx = process.argv.indexOf('--preview');
const previewTimes = previewIdx > -1 ? process.argv[previewIdx + 1].split(',').map(Number) : null;
const DURATION = 30;

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + join(here, 'index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.seek(0));
await page.waitForTimeout(300);

if (previewTimes) {
  for (const t of previewTimes) {
    await page.evaluate(t => window.seek(t), t);
    await page.waitForTimeout(60);
    await page.screenshot({ path: join(outDir, `preview_${t.toFixed(2)}.jpg`), type: 'jpeg', quality: 90 });
    console.log('preview', t);
  }
} else {
  const total = Math.round(DURATION * fps);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    await page.evaluate(t => window.seek(t), t);
    await page.screenshot({ path: join(outDir, `f_${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i % 100 === 0) console.log(`frame ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  console.log(`done: ${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
