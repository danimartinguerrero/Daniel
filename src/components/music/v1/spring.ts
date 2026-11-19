/**
 * A small spring, in Apple's terms: `response` is roughly how long it takes to get there (seconds),
 * `damping` is the damping ratio (1 = critically damped, no overshoot; below 1 it bounces).
 * It always moves from where it is now, with the velocity it has now, so any target change mid-flight
 * stays continuous.
 */
export interface SpringOptions {
  response: number;
  damping: number;
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  done = true;
  opts: SpringOptions;
  /** How close (in value units) counts as at rest. */
  rest: number;

  constructor(value: number, opts: SpringOptions, rest = 0.0005) {
    this.value = value;
    this.target = value;
    this.opts = opts;
    this.rest = rest;
  }

  /** Jump straight to a value and stop (used while a finger drives it). */
  set(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.done = true;
  }

  /** Head for a target; optionally hand over a velocity (value units per second). */
  to(target: number, velocity?: number, opts?: SpringOptions): void {
    this.target = target;
    if (velocity !== undefined && Number.isFinite(velocity)) this.velocity = velocity;
    if (opts) this.opts = opts;
    this.done = false;
  }

  /** Advance by dt seconds. Returns true while it is still moving. */
  step(dt: number): boolean {
    if (this.done) return false;
    const { response, damping } = this.opts;
    const omega = (2 * Math.PI) / Math.max(0.01, response);
    const k = omega * omega;
    const c = 2 * damping * omega;
    // Semi-implicit Euler in small fixed substeps: stable at any frame rate.
    const h = 1 / 480;
    let left = dt;
    while (left > 1e-6) {
      const s = Math.min(h, left);
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * s;
      this.value += this.velocity * s;
      left -= s;
    }
    if (Math.abs(this.value - this.target) < this.rest && Math.abs(this.velocity) < this.rest * 10) {
      this.value = this.target;
      this.velocity = 0;
      this.done = true;
    }
    return !this.done;
  }
}

/** Progressive resistance past a limit: the further past, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Velocity from the last ~100 ms of pointer samples, in px/s. */
export class VelocityTracker {
  private samples: { t: number; x: number }[] = [];
  reset(t: number, x: number): void {
    this.samples = [{ t, x }];
  }
  add(t: number, x: number): void {
    this.samples.push({ t, x });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift();
  }
  velocity(now: number): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1]!;
    // A finger that stopped before lifting has no velocity left.
    if (now - last.t > 80) return 0;
    const first = s[0]!;
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  }
}
