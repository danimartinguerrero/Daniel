// Bake the mobile lineup from the same studio and models as the live scene.
// Run from the repo root with playwright-core on NODE_PATH and CHROME_PATH set to Chromium.
import { createRequire } from 'node:module';
import path from 'node:path';
import { rolldown } from 'rolldown';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const bundle = await rolldown({ input: 'src/components/music/lineup/instrument.ts', platform: 'browser' });
const { output: [studio] } = await bundle.generate({ format: 'es' });
await bundle.close();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.route('http://studio.local/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<canvas></canvas>' });
    if (url.pathname === '/studio.js') return route.fulfill({ contentType: 'text/javascript', body: studio.code });
    return route.fulfill({ path: path.join('public', url.pathname) });
  });
  for (const [name, paint] of [['pj-bass', 'BodyMaterial'], ['les-paul', 'MainBake']]) {
    await page.goto('http://studio.local/');
    const atlas = await page.evaluate(async ({ name, paint }) => {
      const { createInstrument } = await import('/studio.js');
      const canvas = document.querySelector('canvas');
      const lights = ['#f5821f', '#fdb827', '#61bb46', '#e03a3e', '#963d97', '#009ddc'].map((colour, i) => ({
        colour, side: i < 3 ? -1 : 1, rank: 1 + i % 3,
      }));
      const model = await createInstrument(canvas, '/music/instruments/' + name + '.glb', paint, lights, true);
      model.resize(576, true);
      const poses = lights.map(({ side, rank }) => ({ x: side * rank * .09, exposure: 1, lean: 0, yaw: 0 }));
      model.pose(0, poses, 1);
      const sheet = document.createElement('canvas');
      sheet.width = canvas.width * 15;
      sheet.height = canvas.height * 6;
      const context = sheet.getContext('2d');
      for (let i = 0; i < 90; i++) {
        const yaw = i * 4;
        for (const pose of poses) pose.yaw = yaw;
        model.pose(yaw, poses, 1);
        context.drawImage(canvas, (i % 15) * canvas.width, Math.floor(i / 15) * canvas.height);
      }
      model.dispose();
      return sheet.toDataURL('image/png').split(',')[1];
    }, { name, paint });
    await sharp(Buffer.from(atlas, 'base64')).webp({ quality: 88, alphaQuality: 100, effort: 5 })
      .toFile('public/music/instruments/' + name + '/turntable.webp');
  }
} finally {
  await browser.close();
}
