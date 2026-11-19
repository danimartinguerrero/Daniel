import type { Instrument } from './instrument';

const TILE_COUNT = 30;
const STEPS = 6; // Six 2° intervals, with a seventh view shared by the next tile.
const DETAIL_HEIGHT = 1600;
const ASPECT = .32;
const MAX_TILES = 5; // Holds the bass's full 0° to -50° scroll arc without eviction.
const wrapTile = (tile: number) => (tile + TILE_COUNT) % TILE_COUNT;

type Photograph = ImageBitmap | HTMLImageElement;
type Surface = Photograph | HTMLCanvasElement;

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

function release(image: Surface | undefined) {
  if (!image) return;
  if ('close' in image) image.close();
  else if (image instanceof HTMLCanvasElement) image.width = image.height = 0;
}

// Downscale an HD strip once on load to the display canvas height so every scroll frame is a
// 1:1 pixel blit with no live resampling and roughly a third of the decoded memory footprint.
function fitTile(source: Photograph, frameWidth: number, frameHeight: number): Surface {
  if (frameHeight < 32 || frameWidth < 16 || source.height <= frameHeight) return source;
  const sheet = document.createElement('canvas');
  sheet.width = frameWidth * (STEPS + 1);
  sheet.height = frameHeight;
  const ctx = sheet.getContext('2d', { alpha: true });
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, sheet.width, sheet.height);
  release(source);
  return sheet;
}

// Keep pre-scaled HD strips for the visible angles and warm the scroll arc sequentially in the
// background. The compact full-circle sheet covers fast spins when a detail strip hasn't landed yet.
export async function createTurntable(
  canvas: HTMLCanvasElement,
  folder: string,
  initialYaw: number,
  initialSize: number,
  repaint: () => void,
  warmTiles: readonly number[] = [],
): Promise<Instrument> {
  const positionAt = (yaw: number) => ((-yaw % 360 + 360) % 360) / 2;
  const initialTile = Math.floor(positionAt(initialYaw) / STEPS);
  const loadTile = (index: number) => photograph(folder + '/detail/' + index + '.webp');
  const overviewUrl = folder + '/turntable.webp';
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('2D canvas unavailable');

  function sizeCanvas(size: number) {
    if (size <= 0) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const height = Math.min(DETAIL_HEIGHT, Math.max(1, Math.ceil(size * dpr)));
    const width = Math.max(1, Math.round(height * ASPECT));
    canvas.style.width = `${size * ASPECT}px`;
    canvas.style.height = `${size}px`;
    if (canvas.height === height && canvas.width === width) return false;
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  sizeCanvas(initialSize);

  const tiles = new Map<number, Surface>();
  const failed = new Set<number>();
  let overview: Photograph | undefined;
  try {
    const raw = await loadTile(initialTile);
    tiles.set(initialTile, fitTile(raw, canvas.width, canvas.height));
  } catch {
    failed.add(initialTile);
    overview = await photograph(overviewUrl);
  }

  let disposed = false;
  let fetchingTile = false;
  let pendingTile: number | null = null;
  let wantedTile = initialTile;
  let requestedOverview = !!overview;
  let previousYaw = NaN;
  let direction = 0;
  let dirty = true;
  let painted = false;
  const warmQueue = warmTiles.filter(index => index !== initialTile);

  function invalidate() {
    if (disposed) return;
    dirty = true;
    repaint();
  }

  function startFetch(index: number, background: boolean) {
    fetchingTile = true;
    loadTile(index).then(image => {
      if (disposed) return release(image);
      tiles.set(index, fitTile(image, canvas.width, canvas.height));
      if (tiles.size > MAX_TILES) {
        const oldest = tiles.keys().next().value!;
        release(tiles.get(oldest));
        tiles.delete(oldest);
      }
      if (!background || index === wantedTile) invalidate();
    }, () => {
      failed.add(index);
      if (!background || index === wantedTile) invalidate();
    }).finally(() => {
      fetchingTile = false;
      pumpQueue();
    });
  }

  function pumpQueue() {
    if (disposed || fetchingTile) return;
    if (pendingTile !== null) {
      const next = pendingTile;
      pendingTile = null;
      if (!tiles.has(next) && !failed.has(next)) {
        startFetch(next, false);
        return;
      }
    }
    while (warmQueue.length) {
      const next = warmQueue.shift()!;
      if (!tiles.has(next) && !failed.has(next)) {
        startFetch(next, true);
        return;
      }
    }
  }

  function fetchDetail(index: number) {
    if (tiles.has(index) || failed.has(index)) return;
    if (fetchingTile) {
      pendingTile = index;
      return;
    }
    startFetch(index, false);
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

  function paint(image: Surface, position: number, columns: number, rows: number) {
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
    if (blend <= .001) {
      context!.globalAlpha = 1;
      draw(first);
    } else if (blend >= .999) {
      context!.globalAlpha = 1;
      draw((first + 1) % (columns * rows));
    } else {
      context!.globalAlpha = 1 - blend;
      draw(first);
      context!.globalCompositeOperation = 'lighter';
      context!.globalAlpha = blend;
      draw((first + 1) % (columns * rows));
    }
  }

  // Quietly warm the bass's scroll path one tile at a time once the initial view is ready.
  pumpQueue();

  return {
    pose(yaw) {
      if (yaw === previousYaw && !dirty) return;
      if (Number.isFinite(previousYaw) && previousYaw !== yaw) direction = Math.sign(previousYaw - yaw);
      previousYaw = yaw;
      dirty = false;
      const position = positionAt(yaw);
      const tile = Math.floor(position / STEPS);
      wantedTile = tile;
      const local = position - tile * STEPS;
      const image = tiles.get(tile);
      if (image) {
        // Keep the visible tile most-recently-used so prefetching won't evict it.
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
      if (!sizeCanvas(size)) return;
      for (const tile of tiles.values()) release(tile);
      tiles.clear();
      painted = false;
      dirty = true;
    },
    dispose() {
      disposed = true;
      warmQueue.length = 0;
      pendingTile = null;
      for (const tile of tiles.values()) release(tile);
      tiles.clear();
      release(overview);
      overview = undefined;
      canvas.width = canvas.height = 1;
    },
  };
}
