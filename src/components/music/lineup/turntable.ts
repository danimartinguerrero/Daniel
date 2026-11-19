import type { Instrument } from './instrument';

const TILE_COUNT = 30;
const STEPS = 6; // Six 2° intervals, with a seventh view shared by the next tile.
const DETAIL_HEIGHT = 1600;
const ASPECT = .32;
const wrapTile = (tile: number) => (tile + TILE_COUNT) % TILE_COUNT;

type Photograph = ImageBitmap | HTMLImageElement;

async function photograph(url: string): Promise<Photograph> {
  if (typeof createImageBitmap === 'function') {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Missing instrument view');
    return createImageBitmap(await response.blob());
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}

function release(image: Photograph | undefined) {
  if (image && 'close' in image) image.close();
}

// Keep the current and neighbouring HD strips. The small, full-circle sheet covers
// fast spins and slow networks when the next detailed view hasn't arrived yet.
export async function createTurntable(canvas: HTMLCanvasElement, folder: string, initialYaw: number, repaint: () => void): Promise<Instrument> {
  const positionAt = (yaw: number) => ((-yaw % 360 + 360) % 360) / 2;
  const initialTile = Math.floor(positionAt(initialYaw) / STEPS);
  const loadTile = (index: number) => photograph(folder + '/detail/' + index + '.webp');
  const overviewUrl = folder + '/turntable.webp';
  const tiles = new Map<number, Photograph>();
  const failed = new Set<number>();
  let overview: Photograph | undefined;
  try {
    tiles.set(initialTile, await loadTile(initialTile));
  } catch {
    failed.add(initialTile);
    overview = await photograph(overviewUrl);
  }
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    release(tiles.get(initialTile));
    release(overview);
    throw new Error('2D canvas unavailable');
  }

  let disposed = false;
  let fetchingTile = false;
  let requestedOverview = !!overview;
  let previousYaw = NaN;
  let direction = 0;
  let dirty = true;
  let painted = false;
  function invalidate() {
    if (disposed) return;
    dirty = true;
    repaint();
  }
  function fetchDetail(index: number) {
    if (fetchingTile || tiles.has(index) || failed.has(index)) return;
    fetchingTile = true;
    loadTile(index).then(image => {
      if (disposed) return release(image);
      tiles.set(index, image);
      if (tiles.size > 2) {
        const oldest = tiles.keys().next().value!;
        release(tiles.get(oldest));
        tiles.delete(oldest);
      }
    }, () => failed.add(index)).finally(() => {
      fetchingTile = false;
      invalidate();
    });
  }
  function fetchOverview() {
    if (requestedOverview) return;
    requestedOverview = true;
    photograph(overviewUrl).then(image => {
      if (disposed) return release(image);
      overview = image;
      invalidate();
    }, () => {});
  }

  function paint(image: Photograph, position: number, columns: number, rows: number) {
    painted = true;
    const first = Math.floor(position);
    const blend = position - first;
    const width = image.width / columns, height = image.height / rows;
    function draw(frame: number) {
      context!.drawImage(image, frame % columns * width, Math.floor(frame / columns) * height,
        width, height, 0, 0, canvas.width, canvas.height);
    }
    context!.clearRect(0, 0, canvas.width, canvas.height);
    context!.globalCompositeOperation = 'source-over';
    context!.globalAlpha = 1 - blend;
    draw(first);
    if (blend > 0) {
      context!.globalCompositeOperation = 'lighter';
      context!.globalAlpha = blend;
      draw((first + 1) % (columns * rows));
    }
  }

  return {
    pose(yaw) {
      if (yaw === previousYaw && !dirty) return;
      if (Number.isFinite(previousYaw) && previousYaw !== yaw) direction = Math.sign(previousYaw - yaw);
      previousYaw = yaw;
      dirty = false;
      const position = positionAt(yaw);
      const tile = Math.floor(position / STEPS);
      const local = position - tile * STEPS;
      const image = tiles.get(tile);
      if (image) {
        // Keep the visible tile when a prefetch finishes after a change of direction.
        tiles.delete(tile);
        tiles.set(tile, image);
        paint(image, local, STEPS + 1, 1);
        if ((direction > 0 && local >= 2) || (direction < 0 && local <= 4)) fetchDetail(wrapTile(tile + direction));
      } else {
        fetchDetail(tile);
        fetchOverview();
        if (overview) paint(overview, ((yaw % 360 + 360) % 360) / 4, 15, 6);
        else if (!painted) {
          // A deep scroll link can skip the initial pose before the first paint.
          const firstAvailable = tiles.entries().next().value;
          if (firstAvailable) {
            const [index, sheet] = firstAvailable;
            paint(sheet, Math.max(0, Math.min(STEPS, position - index * STEPS)), STEPS + 1, 1);
          }
        }
      }
    },
    resize(size) {
      const height = Math.min(DETAIL_HEIGHT, Math.ceil(size * (devicePixelRatio || 1)));
      canvas.style.width = `${size * ASPECT}px`;
      canvas.style.height = `${size}px`;
      if (canvas.height === height) return;
      canvas.width = Math.max(1, Math.round(height * ASPECT));
      canvas.height = height;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      painted = false;
      dirty = true;
    },
    dispose() {
      disposed = true;
      for (const tile of tiles.values()) release(tile);
      tiles.clear();
      release(overview);
      overview = undefined;
      canvas.width = canvas.height = 1;
    },
  };
}
