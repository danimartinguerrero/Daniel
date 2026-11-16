/**
 * The island's sound: the song through Web Audio, so the meter can read its real spectrum. The
 * needle drop is in the file itself (a CC0 recording mixed onto the start of the song, see
 * public/audio/README.md), so starting is just playing from the top.
 *
 * Browsers only let a page make sound after a user gesture (Safari on iPhone always; Chrome and
 * Safari on the desktop unless the visitor has played media on the site before). `autostart` tries
 * at once and otherwise starts on the first gesture the browser counts: it asks
 * `navigator.userActivation` on every tap, click and key and keeps listening until the song really
 * plays, since which event of a tap grants it differs between browsers (Safari: the touch's end).
 */

/** Fades on pause and resume, in seconds: quick enough to answer the press, long enough not to click. */
const pauseFade = 0.16;
const resumeFade = 0.24;

/** Six bands, log-spaced from the kick to the cymbals, one per bar. */
const bandEdges = [45, 110, 260, 600, 1400, 3300, 9000];

export interface IslandAudio {
  /** The song from the top, needle drop first. Call inside a user gesture. Resolves false when the browser refused. */
  start(): Promise<boolean>;
  /**
   * Play or pause. Pausing fades the song out before it stops and resuming fades it in, and a press
   * during the fade turns it back. Returns whether it is now playing, so the button can change at once.
   */
  toggle(): boolean;
  /** Tries to start now and otherwise on the first gesture. Returns a function that stops waiting. */
  autostart(options: { skip: (target: EventTarget | null) => boolean }): () => void;
  /** The six levels, 0 to 1, every frame while anyone listens. */
  subscribe(listener: (levels: readonly number[]) => void): () => void;
}

/**
 * An element can be wired to Web Audio only once, ever, so its graph outlives any one controller:
 * a remount or a hot reload picks the same graph up again instead of throwing.
 */
const graphs = new WeakMap<HTMLAudioElement, { ctx: AudioContext; songGain: GainNode; analyser: AnalyserNode }>();

/** Whether this event lets the page make sound. Without the API, trust the event types we listen to. */
const activated = () => {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
};

export const createIslandAudio = (el: HTMLAudioElement): IslandAudio => {
  let ctx: AudioContext | null = null;
  let songGain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let spectrum: Float32Array<ArrayBuffer> | null = null;
  /** Set while a pause fades out: the element still plays until it ends. */
  let stopping: number | undefined;

  const listeners = new Set<(levels: readonly number[]) => void>();
  const levels = bandEdges.slice(1).map(() => 0);
  let frame = 0;

  /** The graph, built on first use (inside a gesture): song, gain, analyser, out. */
  const graph = () => {
    if (ctx && songGain && analyser) return { ctx, songGain, analyser };
    const existing = graphs.get(el);
    if (existing) {
      ({ ctx, songGain, analyser } = existing);
      spectrum = new Float32Array(analyser.frequencyBinCount);
      return existing;
    }
    // Safari routes Web Audio as ambient sound, which the iPhone's silent switch mutes; a music
    // player asks for playback.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    ctx = new AudioContext();
    songGain = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    spectrum = new Float32Array(analyser.frequencyBinCount);
    ctx.createMediaElementSource(el).connect(songGain).connect(analyser).connect(ctx.destination);
    graphs.set(el, { ctx, songGain, analyser });
    return { ctx, songGain, analyser };
  };

  const readLevels = () => {
    if (!analyser || !spectrum || !ctx) return;
    analyser.getFloatFrequencyData(spectrum);
    const binHz = ctx.sampleRate / analyser.fftSize;
    for (let b = 0; b < levels.length; b++) {
      let target = 0;
      if (!el.paused) {
        const from = Math.max(1, Math.floor(bandEdges[b] / binHz));
        const to = Math.max(from + 1, Math.ceil(bandEdges[b + 1] / binHz));
        let power = 0;
        for (let i = from; i < to; i++) power += 10 ** (spectrum[i] / 10);
        const db = 10 * Math.log10(power / (to - from) + 1e-12);
        // Higher bands carry less energy in music: lift them about 3.5 dB per band so every bar moves.
        const lifted = db + b * 3.5;
        target = Math.min(1, Math.max(0, (lifted + 72) / 46)) ** 1.4;
      }
      // Quick to rise, slower to fall, as a meter's needle does.
      const rate = target > levels[b] ? 0.55 : 0.18;
      levels[b] += (target - levels[b]) * rate;
    }
  };

  const tick = () => {
    readLevels();
    for (const listener of listeners) listener(levels);
    // Paused and settled: stop reading until the song plays again.
    const idle = el.paused && levels.every((l) => l < 0.002);
    frame = listeners.size > 0 && !idle ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (!frame && listeners.size > 0) frame = requestAnimationFrame(tick);
  };
  el.addEventListener('playing', wake);

  const start = (): Promise<boolean> => {
    const { ctx, songGain } = graph();
    clearTimeout(stopping);
    stopping = undefined;
    songGain.gain.cancelScheduledValues(ctx.currentTime);
    songGain.gain.setValueAtTime(1, ctx.currentTime);
    el.currentTime = 0;
    // Both now, while the gesture still counts.
    const playing = el.play().then(() => true, () => false);
    const resumed = ctx.resume().then(() => ctx.state === 'running', () => false);
    return Promise.all([playing, resumed]).then(([played, running]) => {
      if (played && !running) el.pause();
      return played && running;
    });
  };

  const audio: IslandAudio = {
    start,
    toggle() {
      const { ctx, songGain } = graph();
      const now = ctx.currentTime;
      // Glide the gain from wherever it is, so a press mid-fade turns it around without a jump.
      const glide = (to: number, seconds: number) => {
        songGain.gain.cancelScheduledValues(now);
        songGain.gain.setValueAtTime(songGain.gain.value, now);
        songGain.gain.linearRampToValueAtTime(to, now + seconds);
      };
      if (stopping !== undefined) {
        // Pressed again while fading out: come back up instead.
        clearTimeout(stopping);
        stopping = undefined;
        glide(1, resumeFade);
        return true;
      }
      if (el.paused && (el.currentTime === 0 || el.ended)) {
        void start();
        return true;
      }
      if (el.paused) {
        void ctx.resume();
        songGain.gain.cancelScheduledValues(now);
        songGain.gain.setValueAtTime(0, now);
        void el.play().then(() => glide(1, resumeFade), () => undefined);
        return true;
      }
      glide(0, pauseFade);
      stopping = window.setTimeout(() => {
        stopping = undefined;
        el.pause();
      }, pauseFade * 1000 + 20);
      return false;
    },
    autostart({ skip }) {
      const events = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const;
      let waiting = false;
      let trying = false;
      const listen = (on: boolean) => {
        waiting = on;
        for (const type of events) {
          if (on) window.addEventListener(type, onGesture, { capture: true, passive: true });
          else window.removeEventListener(type, onGesture, true);
        }
      };
      const attempt = () => {
        trying = true;
        void start().then((ok) => {
          trying = false;
          if (ok || !el.paused) listen(false);
        });
      };
      function onGesture(event: Event) {
        if (!waiting || trying) return;
        // A press on the island's own play button is the visitor choosing: it starts the song itself.
        if (skip(event.target)) { listen(false); return; }
        // Only an event the browser counts as a gesture can start sound; the rest of a tap's
        // events go by until one does (on iPhone, the touch's end, not its start).
        if (!activated()) return;
        attempt();
      }
      listen(true);
      // A browser that allows sound without a gesture (a returning visitor) starts now.
      attempt();
      return () => listen(false);
    },
    subscribe(listener) {
      listeners.add(listener);
      wake();
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return audio;
};
