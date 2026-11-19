/**
 * A small spring, in Apple's terms: `response` is roughly how long it takes to get there (seconds),
 * `damping` is the damping ratio (1 = critically damped, no overshoot; below 1 it bounces).
 *
 * It always moves from where it is now, at the speed it is moving now, so retargeting mid-flight or
 * handing it a finger's release velocity never shows a seam.
 */
export interface SpringConfig {
  response: number;
  damping: number;
}

export const SNAP: SpringConfig = { response: 0.38, damping: 1 };

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private k = 0;
  private c = 0;
  /** Below this distance and speed the spring rests on its target. */
  private readonly precision: number;

  constructor(value: number, config: SpringConfig = SNAP, precision = 0.001) {
    this.value = value;
    this.target = value;
    this.precision = precision;
    this.configure(config);
  }

  configure({ response, damping }: SpringConfig): this {
    const w = (2 * Math.PI) / Math.max(0.05, response);
    this.k = w * w;
    this.c = 2 * damping * w;
    return this;
  }

  /** Aim at a new target; `velocity` (units/s) replaces the current one when given (a finger let go). */
  to(target: number, config?: SpringConfig, velocity?: number): this {
    this.target = target;
    if (config) this.configure(config);
    if (velocity !== undefined) this.velocity = velocity;
    return this;
  }

  /** Jump, with no motion. */
  set(value: number): this {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    return this;
  }

  get resting(): boolean {
    return this.value === this.target && this.velocity === 0;
  }

  /** Advance by dt seconds. Returns true while it still moves. */
  step(dt: number): boolean {
    if (this.resting) return false;
    // Semi-implicit Euler in fixed 1/240 s slices: stable for stiff springs, cheap for eight of them.
    const h = 1 / 240;
    let t = dt;
    while (t > 0) {
      const s = Math.min(h, t);
      const a = -this.k * (this.value - this.target) - this.c * this.velocity;
      this.velocity += a * s;
      this.value += this.velocity * s;
      t -= s;
    }
    if (Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 10) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}

/**
 * One requestAnimationFrame loop for everything that moves. Each job is called with dt (seconds)
 * and returns true while it still has work; the loop stops when none does.
 */
type Job = (dt: number) => boolean;
const jobs = new Set<Job>();
let frame = 0;
let last = 0;

function tick(now: number): void {
  const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
  last = now;
  for (const job of [...jobs]) if (!job(dt)) jobs.delete(job);
  frame = jobs.size ? requestAnimationFrame(tick) : 0;
  if (!frame) last = 0;
}

export function run(job: Job): void {
  jobs.add(job);
  if (!frame) frame = requestAnimationFrame(tick);
}

export function stop(job: Job): void {
  jobs.delete(job);
}

/** Apple's momentum projection: where a flick at `velocity` (units/s) comes to rest. */
export function project(velocity: number, deceleration = 0.998): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

/** Resistance past a limit: the further past, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Velocity from the last ~100 ms of pointer samples, in units/s. */
export class VelocityTracker {
  private samples: { t: number; x: number }[] = [];
  reset(x: number, t = performance.now()): void {
    this.samples = [{ t, x }];
  }
  add(x: number, t = performance.now()): void {
    this.samples.push({ t, x });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift();
  }
  get velocity(): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const a = s[0]!;
    const b = s[s.length - 1]!;
    // A finger that stopped before letting go has no velocity.
    if (performance.now() - b.t > 80) return 0;
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.x - a.x) / dt : 0;
  }
}
