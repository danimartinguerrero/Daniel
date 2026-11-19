/**
 * A small spring for the wall (Design 3), in Apple's two terms: `response` (seconds, how quickly it
 * gets there) and `damping` (1 = critically damped, below 1 overshoots). It always starts from the
 * value currently on screen and keeps its velocity when it is re-targeted, so every motion on the
 * page can be grabbed and reversed mid-flight.
 */
export interface SpringConfig {
  response: number;
  damping: number;
}

export interface SpringRun {
  velocity?: number;
  onRest?: () => void;
}

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private k = 0;
  private c = 0;
  private raf = 0;
  private last = 0;
  private onRest: (() => void) | undefined;

  constructor(
    value: number,
    private readonly onUpdate: (value: number) => void,
    /** How close counts as there, in the value's own units. */
    private readonly precision = 0.001,
  ) {
    this.value = value;
    this.target = value;
  }

  get running(): boolean {
    return this.raf !== 0;
  }

  /** Jump to a value (a finger is holding it): no motion, no velocity. */
  set(value: number): void {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onRest = undefined;
  }

  to(target: number, config: SpringConfig, run: SpringRun = {}): void {
    const restCallback = run.onRest;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.target = target;
    const w = (2 * Math.PI) / config.response;
    this.k = w * w;
    this.c = 2 * config.damping * w;
    if (run.velocity !== undefined) this.velocity = run.velocity;
    this.onRest = restCallback;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), 1 / 30);
    this.last = now;
    const steps = 4;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.value - this.target) - this.c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    const settled = Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 10;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
      this.onUpdate(this.value);
      const done = this.onRest;
      this.onRest = undefined;
      done?.();
      return;
    }
    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this.tick);
  };
}

/** Where a released gesture would come to rest (Apple's deceleration projection), in px. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Past a limit, follow the finger less and less. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Release velocity in units per second, from the last ~100 ms of a drag. */
export class VelocityTracker {
  private samples: { t: number; x: number }[] = [];

  reset(): void {
    this.samples = [];
  }

  add(t: number, x: number): void {
    this.samples.push({ t, x });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift();
  }

  velocity(): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const a = s[0]!;
    const b = s[s.length - 1]!;
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.x - a.x) / dt : 0;
  }
}

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
