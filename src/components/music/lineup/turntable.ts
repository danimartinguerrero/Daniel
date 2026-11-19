import type { Instrument } from './instrument';

// The mobile studio is photographed every four degrees (scripts/instrument-turntables.mjs).
// Blend adjacent views in premultiplied alpha so the strings and the outer contour turn continuously.
export async function createTurntable(canvas: HTMLCanvasElement, url: string): Promise<Instrument> {
  const sheet = new Image();
  sheet.decoding = 'async';
  sheet.src = url;
  await sheet.decode();
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('2D canvas unavailable');

  const columns = 15, rows = 6;
  const count = columns * rows;
  const width = canvas.width = sheet.naturalWidth / columns;
  const height = canvas.height = sheet.naturalHeight / rows;
  let last = NaN;

  function draw(frame: number) {
    context!.drawImage(sheet, frame % columns * width, Math.floor(frame / columns) * height,
      width, height, 0, 0, width, height);
  }

  return {
    pose(degrees) {
      if (degrees === last) return;
      last = degrees;
      const angle = ((degrees % 360) + 360) % 360;
      const position = angle / 360 * count;
      const first = Math.floor(position);
      const blend = position - first;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1 - blend;
      draw(first);
      if (blend > 0) {
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = blend;
        draw((first + 1) % count);
      }
    },
    resize(size) {
      canvas.style.width = `${size * width / height}px`;
      canvas.style.height = `${size}px`;
    },
    dispose() {
      sheet.removeAttribute('src');
      canvas.width = canvas.height = 1;
    },
  };
}
