/**
 * Design 4, "Listening bar": the small physics the page moves with. A spring described the way Apple
 * describes it (response in seconds, damping ratio; 1 = no bounce), which always starts from the value
 * on screen and keeps whatever velocity it has, so any motion can be grabbed or reversed mid-flight.
 */

export interface SpringOptions {
  /** Roughly how long it takes to get there, in seconds. Not a duration: a spring has none. */
  response: number;
  /** 1 settles without overshoot; below 1 it bounces a little. */
  damping: number;
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  response = 0.45;
  damping = 1;
  /** Close enough to call it settled, in the spring's own units. */
  precision: number;

  constructor(value: number, options: Partial<SpringOptions> = {}, precision = 0.0005) {
    this.value = value;
    this.target = value;
    this.precision = precision;
    Object.assign(this, options);
  }

  /** Head for a new target from wherever the value is now. Pass a velocity to hand off a gesture's. */
  to(target: number, options: Partial<SpringOptions> & { velocity?: number } = {}) {
    this.target = target;
    if (options.response !== undefined) this.response = options.response;
    if (options.damping !== undefined) this.damping = options.damping;
    if (options.velocity !== undefined) this.velocity = options.velocity;
  }

  /** Jump: the value is now exactly this, at rest. */
  set(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  get settled() {
    return this.value === this.target && this.velocity === 0;
  }

  /** Advance by dt seconds. Returns true once at rest. */
  step(dt: number): boolean {
    if (this.settled) return true;
    const w = (2 * Math.PI) / this.response;
    const k = w * w;
    const c = 2 * this.damping * w;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
      left -= h;
    }
    if (Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 10) {
      this.value = this.target;
      this.velocity = 0;
      return true;
    }
    return false;
  }
}

/** Where a throw would come to rest, as scrolling decelerates (Apple's projection). In px for px/s. */
export function project(velocity: number, decelerationRate = 0.996) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Resistance past an edge: the further past, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  const sign = Math.sign(overshoot);
  const o = Math.abs(overshoot);
  return (sign * (o * dimension * constant)) / (dimension + constant * o);
}

/** The pointer's recent velocity, in px/s, from the last few moves (zero if the finger came to rest). */
export class VelocityTracker {
  private samples: { x: number; t: number }[] = [];

  reset(x: number, t: number) {
    this.samples = [{ x, t }];
  }

  push(x: number, t: number) {
    this.samples.push({ x, t });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift();
  }

  velocity(now: number) {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1]!;
    if (now - last.t > 70) return 0;
    const first = s[0]!;
    const dt = last.t - first.t;
    return dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
