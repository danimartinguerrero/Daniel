import type { Instrument } from './instrument';

const TILE_COUNT = 30;
const STEPS = 6; // Six 2° intervals, with a seventh view shared by the next tile.
const SCROLL_COLS = 14, SCROLL_ROWS = 2, SCROLL_FRAMES = SCROLL_COLS * SCROLL_ROWS; // 0° to -54° every 2°
const SCROLL_HEIGHT = 700;
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

// A single pre-scaled sheet (`scroll.webp`) covers the bass's entire 0° to -50° scroll arc with
// zero mid-scroll network requests, decodes or GPU texture uploads. Full-circle detail strips and
// the overview sheet load only when the reader grabs an instrument and spins it past that arc.
export async function createTurntable(
  canvas: HTMLCanvasElement,
  folder: string,
  initialYaw: number,
  initialSize: number,
  repaint: () => void,
  hasScrollSheet = false,
): Promise<Instrument> {
  const positionAt = (yaw: number) => ((-yaw % 360 + 360) % 360) / 2;
  const initialPosition = positionAt(initialYaw);
  const initialTile = Math.floor(initialPosition / STEPS);
  const loadTile = (index: number) => photograph(folder + '/detail/' + index + '.webp');
  const overviewUrl = folder + '/turntable.webp';
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('2D canvas unavailable');

  function sizeCanvas(size: number) {
    if (size <= 0) return false;
    const cap = hasScrollSheet ? SCROLL_HEIGHT : DETAIL_HEIGHT;
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    const height = Math.min(cap, Math.max(1, Math.ceil(size * dpr)));
    const width = Math.max(1, Math.round(height * ASPECT));
    canvas.style.width = `${size * ASPECT}px`;
    canvas.style.height = `${size}px`;
    if (canvas.height === height && canvas.width === width) return false;
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  sizeCanvas(initialSize);

  const tiles = new Map<number, Photograph>();
  const failed = new Set<number>();
  let scrollSheet: Photograph | undefined;
  let overview: Photograph | undefined;

  if (hasScrollSheet && initialPosition <= SCROLL_FRAMES - 1) {
    try {
      scrollSheet = await photograph(folder + '/scroll.webp');
    } catch {
      // Fall back to the per-angle detail strips if the scroll sheet is missing.
    }
  }
  if (!scrollSheet) {
    try {
      tiles.set(initialTile, await loadTile(initialTile));
    } catch {
      failed.add(initialTile);
      overview = await photograph(overviewUrl);
    }
  }

  let disposed = false;
  let fetchingTile = false;
  let pendingTile: number | null = null;
  let requestedOverview = !!overview;
  let previousYaw = NaN;
  let drawnYaw = NaN;
  let direction = 0;
  let dirty = true;
  let painted = false;

  function invalidate() {
    if (disposed) return;
    dirty = true;
    repaint();
  }

  function fetchDetail(index: number) {
    if (tiles.has(index) || failed.has(index)) return;
    if (fetchingTile) {
      pendingTile = index;
      return;
    }
    fetchingTile = true;
    loadTile(index).then(image => {
      if (disposed) return release(image);
      tiles.set(index, image);
      if (tiles.size > 3) {
        const oldest = tiles.keys().next().value!;
        release(tiles.get(oldest));
        tiles.delete(oldest);
      }
      invalidate();
    }, () => failed.add(index)).finally(() => {
      fetchingTile = false;
      if (!disposed && pendingTile !== null) {
        const next = pendingTile;
        pendingTile = null;
        fetchDetail(next);
      }
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

  function paint(image: Photograph, position: number, columns: number, rows: number, wrapFrames: boolean, singlePass: boolean) {
    painted = true;
    const total = columns * rows;
    const width = image.width / columns, height = image.height / rows;
    function draw(frame: number) {
      context!.drawImage(image, frame % columns * width, Math.floor(frame / columns) * height,
        width, height, 0, 0, canvas.width, canvas.height);
    }
    context!.clearRect(0, 0, canvas.width, canvas.height);
    context!.globalCompositeOperation = 'source-over';
    if (singlePass) {
      const nearest = wrapFrames ? Math.round(position) % total : Math.min(total - 1, Math.round(position));
      context!.globalAlpha = 1;
      draw(nearest);
      return;
    }
    const first = Math.floor(position);
    const blend = position - first;
    const second = wrapFrames ? (first + 1) % total : Math.min(total - 1, first + 1);
    if (blend <= .01 || second === first) {
      context!.globalAlpha = 1;
      draw(first);
    } else if (blend >= .99) {
      context!.globalAlpha = 1;
      draw(second);
    } else {
      context!.globalAlpha = 1 - blend;
      draw(first);
      context!.globalCompositeOperation = 'lighter';
      context!.globalAlpha = blend;
      draw(second);
    }
  }

  // Upload the decoded bitmap to the GPU backing texture ahead of scroll.
  if (canvas.width > 1 && canvas.height > 1) {
    if (scrollSheet) paint(scrollSheet, initialPosition, SCROLL_COLS, SCROLL_ROWS, false, false);
    else if (tiles.has(initialTile)) paint(tiles.get(initialTile)!, initialPosition - initialTile * STEPS, STEPS + 1, 1, false, false);
    drawnYaw = previousYaw = initialYaw;
    dirty = false;
  }

  return {
    pose(yaw) {
      const exactRest = yaw === 0 || yaw === -50;
      if (!dirty && (yaw === drawnYaw || (!exactRest && Math.abs(yaw - drawnYaw) < .12))) return;
      const step = Number.isFinite(previousYaw) ? Math.abs(yaw - previousYaw) : 0;
      if (Number.isFinite(previousYaw) && previousYaw !== yaw) direction = Math.sign(previousYaw - yaw);
      previousYaw = yaw;
      drawnYaw = yaw;
      dirty = false;
      const fast = !exactRest && step > .75;
      const position = positionAt(yaw);
      if (scrollSheet && position <= SCROLL_FRAMES - 1) {
        paint(scrollSheet, position, SCROLL_COLS, SCROLL_ROWS, false, fast);
        return;
      }
      const tile = Math.floor(position / STEPS);
      const local = position - tile * STEPS;
      const image = tiles.get(tile);
      if (image) {
        tiles.delete(tile);
        tiles.set(tile, image);
        paint(image, local, STEPS + 1, 1, false, fast);
        if ((direction > 0 && local >= 2) || (direction < 0 && local <= 4)) fetchDetail(wrapTile(tile + direction));
      } else {
        fetchDetail(tile);
        fetchOverview();
        if (overview) paint(overview, ((yaw % 360 + 360) % 360) / 4, 15, 6, true, fast);
        else if (!painted) {
          const firstAvailable = tiles.entries().next().value;
          if (firstAvailable) {
            const [index, sheet] = firstAvailable;
            paint(sheet, Math.max(0, Math.min(STEPS, position - index * STEPS)), STEPS + 1, 1, false, true);
          }
        }
      }
    },
    resize(size) {
      if (!sizeCanvas(size)) return;
      painted = false;
      dirty = true;
    },
    dispose() {
      disposed = true;
      pendingTile = null;
      release(scrollSheet);
      scrollSheet = undefined;
      for (const tile of tiles.values()) release(tile);
      tiles.clear();
      release(overview);
      overview = undefined;
      canvas.width = canvas.height = 1;
    },
  };
}
