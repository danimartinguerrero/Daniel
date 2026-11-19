/**
 * Where everything on the line goes, worked out at build time from the records' years, so the picture
 * stays true when a record is added.
 *
 * Each record has a tick on its exact year. Its cover sits as near above (or, on a phone, beside) that
 * tick as it can without touching its neighbours; when records come out close together their covers
 * fan out and a thin leader runs from each cover back to its own year. The ticks never move, so the
 * scale stays honest however crowded a stretch is.
 */
import { vinyls, type Vinyl } from '@/data/music';

/** Records closer than this many years count as one run ("Three from 1969 to 1979"). */
const RUN_GAP = 8;

/**
 * Centres as near the wanted ones as they can be, in order, each pair at least (size + size) / 2 + gap
 * apart, kept between lo and hi. A least-squares fit (pool adjacent violators) on the centres with the
 * spacing taken out, so a crowded stretch spreads evenly both ways instead of being pushed one way.
 */
export function dodge(want: number[], size: number[], gap: number, lo: number, hi: number): number[] {
  const n = want.length;
  const off: number[] = [0];
  for (let i = 1; i < n; i++) off.push(off[i - 1]! + (size[i - 1]! + size[i]!) / 2 + gap);
  const blocks: { sum: number; len: number }[] = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: want[i]! - off[i]!, len: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!, a = blocks[blocks.length - 2]!;
      if (a.sum / a.len <= b.sum / b.len) break;
      blocks.pop();
      a.sum += b.sum;
      a.len += b.len;
    }
  }
  const p: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.len; k++) p.push(b.sum / b.len + off[p.length]!);
  // Within the bounds: pushed in from the far end first, then from the near end.
  for (let i = n - 1; i >= 0; i--) p[i] = Math.min(p[i]!, i === n - 1 ? hi - size[i]! / 2 : p[i + 1]! - (size[i]! + size[i + 1]!) / 2 - gap);
  for (let i = 0; i < n; i++) p[i] = Math.max(p[i]!, i === 0 ? lo + size[i]! / 2 : p[i - 1]! + (size[i - 1]! + size[i]!) / 2 + gap);
  return p;
}

export interface Placed {
  v: Vinyl;
  /** Index in the carousel (the data's order). */
  index: number;
  /** Desktop: the year's place on the line and the cover's centre, in % of the chart's width. */
  x: number;
  p: number;
  /** Desktop: 0, the row above the line; 1, the row under it. */
  tier: 0 | 1;
  /** Phone: the year's place down the line and the cover's centre, in px from the top. */
  ty: number;
  cy: number;
}

export interface Run {
  count: number;
  from: number;
  to: number;
  /** Desktop: where the run starts and ends on the line, %. */
  a: number;
  b: number;
  /** Phone: where its heading sits, px from the top. */
  hy: number;
}

export const NOW = new Date().getFullYear();

/* Desktop: everything in % of the chart's width (the CSS turns it into cqw). Covers 7.5% wide (about
   100px at 1440, 108 at 2000) with 1% between neighbours in a row. They take two rows, one above the
   line and one under it, so a crowded stretch alternates up and down and each cover stays close to its
   year; a row only fans out where it must, and then by a year or two. `hiLow` keeps the row under the
   line clear of the line that turns down at Now. */
export const D = { cover: 7.5, gap: 1, hiLow: 1.6 } as const;
/* Phone: px. 20 px a year: the six records since 2012 need more room than their twelve years, and at
   this scale they borrow little of the empty stretch before them, which stays under a third of an
   iPhone's screen and still reads as years passing. Covers 56 px with 10 px between; headings 24 px. */
export const M = { year: 20, cover: 56, head: 24, gap: 10, top: 8 } as const;

export function layout() {
  const sorted = vinyls.map((v, index) => ({ v, index })).sort((a, b) => a.v.year - b.v.year || a.index - b.index);
  const first = sorted[0]!.v.year;
  const start = first - 3;
  const span = Math.max(1, NOW - start);
  const x = (year: number) => ((year - start) / span) * 100;
  const yy = (year: number) => M.top + M.head + M.gap + (year - start) * M.year;

  // Runs of records that came out close together.
  const runs: { from: number; to: number; members: number[] }[] = [];
  sorted.forEach((r, i) => {
    const last = runs[runs.length - 1];
    if (last && r.v.year - last.to < RUN_GAP) {
      last.to = r.v.year;
      last.members.push(i);
    } else runs.push({ from: r.v.year, to: r.v.year, members: [i] });
  });

  // Desktop: each record goes to the row where it has to move least (above the line when both are
  // free), then each row's covers dodge their neighbours.
  const step = D.cover + D.gap;
  const lastIn: [number, number] = [-Infinity, -Infinity];
  const tiers = sorted.map((r) => {
    const want = x(r.v.year);
    const cost = (t: 0 | 1) => Math.max(0, lastIn[t] + step - want);
    const t: 0 | 1 = cost(1) < cost(0) ? 1 : 0;
    lastIn[t] = Math.max(want, lastIn[t] + step);
    return t;
  });
  const px: number[] = new Array(sorted.length).fill(0);
  for (const t of [0, 1] as const) {
    const idx = tiers.flatMap((tt, i) => (tt === t ? [i] : []));
    const hi = t === 0 ? 100 : 100 - D.hiLow;
    const pos = dodge(idx.map((i) => x(sorted[i]!.v.year)), idx.map(() => D.cover), D.gap, 0, hi);
    idx.forEach((i, k) => (px[i] = pos[k]!));
  }

  // Phone: each run's heading goes in the column just before its first cover, and both dodge together.
  const items: { kind: 'head' | 'rec'; i: number; want: number; size: number }[] = [];
  runs.forEach((run, ri) => {
    items.push({ kind: 'head', i: ri, want: yy(run.from) - M.cover / 2 - M.gap - M.head / 2, size: M.head });
    for (const m of run.members) items.push({ kind: 'rec', i: m, want: yy(sorted[m]!.v.year), size: M.cover });
  });
  const nowY = yy(NOW);
  const py = dodge(items.map((it) => it.want), items.map((it) => it.size), M.gap, 0, nowY - M.gap - 8);

  const placed: Placed[] = sorted.map((r, i) => ({ ...r, x: x(r.v.year), p: px[i]!, tier: tiers[i]!, ty: yy(r.v.year), cy: 0 }));
  const outRuns: Run[] = runs.map((run) => ({ count: run.members.length, from: run.from, to: run.to, a: x(run.from), b: x(run.to), hy: 0 }));
  items.forEach((it, k) => {
    if (it.kind === 'rec') placed[it.i]!.cy = py[k]!;
    else outRuns[it.i]!.hy = py[k]!;
  });

  const decades: { year: number; x: number; y: number }[] = [];
  for (let d = Math.ceil(start / 10) * 10; d < NOW - 2; d += 10) decades.push({ year: d, x: x(d), y: yy(d) });

  return { placed, runs: outRuns, decades, first, start, nowY, height: nowY + 6 };
}
