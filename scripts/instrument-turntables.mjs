// Bake the mobile lineup from the same studio and models as the live scene.
// Run from the repo root with playwright-core on NODE_PATH and CHROME_PATH set to Chromium.
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
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
  const detail = process.argv.includes('--detail');
  const size = detail ? 1600 : 576;
  for (const [name, paint] of [['pj-bass', 'BodyMaterial'], ['les-paul', 'MainBake']]) {
    await page.goto('http://studio.local/');
    await page.evaluate(async ({ name, paint, size }) => {
      const { createInstrument } = await import('/studio.js');
      const canvas = document.querySelector('canvas');
      const lights = ['#f5821f', '#fdb827', '#61bb46', '#e03a3e', '#963d97', '#009ddc'].map((colour, i) => ({
        colour, side: i < 3 ? -1 : 1, rank: 1 + i % 3,
      }));
      const model = await createInstrument(canvas, '/music/instruments/' + name + '.glb', paint, lights, true);
      model.resize(size, true);
      const poses = lights.map(({ side, rank }) => ({ x: side * rank * .09, exposure: 1, lean: 0, yaw: 0 }));
      window.renderPose = yaw => {
        for (const pose of poses) pose.yaw = yaw;
        model.pose(yaw, poses, 1);
        return canvas;
      };
    }, { name, paint, size });

    const folder = 'public/music/instruments/' + name;
    if (detail) await mkdir(folder + '/detail', { recursive: true });
    const sheets = detail ? 30 : 1;
    for (let tile = 0; tile < sheets; tile++) {
      const png = await page.evaluate(({ detail, tile }) => {
        const columns = detail ? 7 : 15, rows = detail ? 1 : 6;
        const sheet = document.createElement('canvas');
        // The seventh HD view is the next tile's first pose, for interpolation across its edge.
        for (let i = 0; i < columns * rows; i++) {
          const yaw = detail ? -2 * ((tile * 6 + i) % 180) : i * 4;
          // The preceding sheet ended at this angle. Force a fresh frame after Chrome presents it.
          if (i === 0 && tile > 0) window.renderPose(yaw + 1);
          const canvas = window.renderPose(yaw);
          if (i === 0) {
            sheet.width = canvas.width * columns;
            sheet.height = canvas.height * rows;
          }
          sheet.getContext('2d').drawImage(canvas, (i % columns) * canvas.width, Math.floor(i / columns) * canvas.height);
        }
        return sheet.toDataURL('image/png').split(',')[1];
      }, { detail, tile });
      const source = Buffer.from(png, 'base64');
      const output = detail ? folder + '/detail/' + tile + '.webp' : folder + '/turntable.webp';
      await sharp(source).webp({ quality: detail ? 94 : 88, alphaQuality: 100, effort: 4 }).toFile(output);
      if (detail && ((name === 'pj-bass' && tile === 0) || (name === 'les-paul' && tile === 4))) {
        const bass = name === 'pj-bass';
        const width = Math.floor(size * .32);
        await sharp(source).extract({ left: bass ? 0 : width, top: 0, width, height: size })
          .withExif({ IFD0: { Artist: bass ? 'Ryan_Nein' : 'proudlove1', Copyright: 'Model: CC BY 4.0' } })
          .webp({ quality: 95, alphaQuality: 100 }).toFile(folder + (bass ? '/rest-front.webp' : '/rest-50.webp'));
      }
    }
    if (detail && name === 'pj-bass') {
      const fw = 224, fh = 700, cols = 14, rows = 2;
      const composites = [];
      for (let pos = 0; pos < cols * rows; pos++) {
        const tile = Math.floor(pos / 6), local = pos - tile * 6;
        const input = await sharp(`${folder}/detail/${tile}.webp`)
          .extract({ left: local * 512, top: 0, width: 512, height: 1600 })
          .resize(fw, fh, { kernel: 'lanczos3' }).png().toBuffer();
        composites.push({ input, left: (pos % cols) * fw, top: Math.floor(pos / cols) * fh });
      }
      await sharp({ create: { width: cols * fw, height: rows * fh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(composites)
        .withExif({ IFD0: { Artist: 'Ryan_Nein', Copyright: 'Model: CC BY 4.0' } })
        .webp({ quality: 88, alphaQuality: 92, effort: 6 }).toFile(`${folder}/scroll.webp`);
    }
  }
} finally {
  await browser.close();
}
