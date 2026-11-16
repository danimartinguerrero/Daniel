/**
 * The island's sound: the song through Web Audio, so the meter can read its real spectrum, and a
 * needle drop synthesised in front of it (no recorded sample: a thump as the stylus lands, a short
 * scrape as it settles into the groove, then surface crackle that carries into the music and fades).
 *
 * Browsers only let a page make sound after a user gesture (Safari on iPhone always; Chrome unless
 * the visitor has played media on the site before). `autostart` tries at once and otherwise starts
 * on the first tap, click or key anywhere on the page. On Safari, `play()` has to run inside that
 * gesture, so the song starts at once, silent, and is rewound and faded in when the needle lands.
 */

/** When the music comes in after the needle starts, in seconds. */
const needleLead = 0.85;

/** Fades on pause and resume, in seconds: quick enough to answer the press, long enough not to click. */
const pauseFade = 0.16;
const resumeFade = 0.24;

/** Six bands, log-spaced from the kick to the cymbals, one per bar. */
const bandEdges = [45, 110, 260, 600, 1400, 3300, 9000];

export interface IslandAudio {
  /** Needle drop, then the song from the start. Call inside a user gesture. Resolves false when the browser refused. */
  start(): Promise<boolean>;
  /**
   * Play or pause; the first play (or one after the song ended) drops the needle. Pausing fades the
   * song out before it stops and resuming fades it in, and a press during the fade turns it back.
   * Returns whether it is now playing, so the button can change at once.
   */
  toggle(): boolean;
  /** Tries to start now and otherwise on the first gesture. Returns a function that stops waiting. */
  autostart(options: { skip: (target: EventTarget | null) => boolean }): () => void;
  /** The six levels, 0 to 1, every frame while anyone listens. */
  subscribe(listener: (levels: readonly number[]) => void): () => void;
  /** True between the gesture and the needle landing: the element plays, silent. */
  readonly prerolling: boolean;
}

const noise = (ctx: BaseAudioContext, seconds: number, fill: (data: Float32Array, rate: number) => void) => {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  fill(buffer.getChannelData(0), ctx.sampleRate);
  return buffer;
};

/** White noise. */
const hiss = (data: Float32Array) => {
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
};

/** Surface noise: a low hiss with sparse pops, each a sharp spike with a few samples of tail. */
const crackle = (data: Float32Array, rate: number) => {
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.035;
  const pops = Math.round((data.length / rate) * 22);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.random() * data.length);
    const size = (Math.random() < 0.15 ? 0.9 : 0.35) * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
    const tail = 2 + Math.floor(Math.random() * 10);
    for (let k = 0; k < tail && at + k < data.length; k++) data[at + k] += size * Math.exp(-k / (tail / 3));
  }
};

/** Schedules the needle drop on `out` from `t`. */
const dropNeedle = (ctx: AudioContext, out: AudioNode, t: number) => {
  // The landing: a low thump falling in pitch.
  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(75, t);
  thump.frequency.exponentialRampToValueAtTime(36, t + 0.14);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.85, t + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  thump.connect(thumpGain).connect(out);
  thump.start(t);
  thump.stop(t + 0.35);

  // The stylus touching vinyl: a bright click, then a short scrape as it finds the groove.
  const burst = ctx.createBufferSource();
  burst.buffer = noise(ctx, 0.5, hiss);
  const bright = ctx.createBiquadFilter();
  bright.type = 'bandpass';
  bright.frequency.setValueAtTime(3200, t);
  bright.frequency.exponentialRampToValueAtTime(900, t + 0.3);
  bright.Q.value = 0.9;
  const burstGain = ctx.createGain();
  burstGain.gain.setValueAtTime(0.0001, t);
  burstGain.gain.exponentialRampToValueAtTime(0.5, t + 0.003);
  burstGain.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
  burstGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  burst.connect(bright).connect(burstGain).connect(out);
  burst.start(t);

  // Surface crackle from the landing on, under the first seconds of the song, then gone.
  const surface = ctx.createBufferSource();
  surface.buffer = noise(ctx, 3, crackle);
  surface.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'highpass';
  low.frequency.value = 380;
  const high = ctx.createBiquadFilter();
  high.type = 'lowpass';
  high.frequency.value = 7000;
  const surfaceGain = ctx.createGain();
  const music = t + needleLead;
  surfaceGain.gain.setValueAtTime(0.0001, t);
  surfaceGain.gain.exponentialRampToValueAtTime(0.32, t + 0.06);
  surfaceGain.gain.setValueAtTime(0.32, music);
  surfaceGain.gain.exponentialRampToValueAtTime(0.1, music + 1.5);
  surfaceGain.gain.exponentialRampToValueAtTime(0.0001, music + 6);
  surface.connect(low).connect(high).connect(surfaceGain).connect(out);
  surface.start(t);
  surface.stop(music + 6.1);
};

/**
 * An element can be wired to Web Audio only once, ever, so its graph outlives any one controller:
 * a remount or a hot reload picks the same graph up again instead of throwing.
 */
const graphs = new WeakMap<HTMLAudioElement, { ctx: AudioContext; songGain: GainNode; analyser: AnalyserNode }>();

export const createIslandAudio = (el: HTMLAudioElement): IslandAudio => {
  let ctx: AudioContext | null = null;
  let songGain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let spectrum: Float32Array<ArrayBuffer> | null = null;
  let prerolling = false;
  let landing: number | undefined;
  /** Set while a pause fades out: the element still plays until it ends. */
  let stopping: number | undefined;

  const listeners = new Set<(levels: readonly number[]) => void>();
  const levels = bandEdges.slice(1).map(() => 0);
  let frame = 0;

  /** The graph, built on first use: song, gain, analyser, out; the needle goes straight out. */
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
    const sounding = !el.paused && !prerolling;
    for (let b = 0; b < levels.length; b++) {
      let target = 0;
      if (sounding) {
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
    const idle = (el.paused || prerolling) && levels.every((l) => l < 0.002);
    frame = listeners.size > 0 && !idle ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (!frame && listeners.size > 0) frame = requestAnimationFrame(tick);
  };
  el.addEventListener('playing', wake);
  el.addEventListener('seeked', wake);

  const start = (): Promise<boolean> => {
    const { ctx, songGain } = graph();
    clearTimeout(landing);
    // Silent until the needle lands; play() and resume() now, while the gesture still counts.
    prerolling = true;
    songGain.gain.cancelScheduledValues(ctx.currentTime);
    songGain.gain.setValueAtTime(0, ctx.currentTime);
    el.currentTime = 0;
    const playing = el.play().then(() => true, () => false);
    const resumed = ctx.resume().then(() => ctx.state === 'running', () => false);
    return Promise.all([playing, resumed]).then(([played, running]) => {
      // Refused: undo, and schedule nothing on a suspended context (it would sound on the next try).
      if (!played || !running) {
        prerolling = false;
        if (played) el.pause();
        return false;
      }
      if (!prerolling) return false; // paused before it got going
      dropNeedle(ctx, ctx.destination, ctx.currentTime + 0.02);
      landing = window.setTimeout(() => {
        prerolling = false;
        if (el.paused) return;
        el.currentTime = 0;
        const now = ctx.currentTime;
        songGain.gain.setValueAtTime(0, now);
        songGain.gain.linearRampToValueAtTime(1, now + 0.35);
        wake();
      }, (needleLead + 0.02) * 1000);
      return true;
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
      if (prerolling) {
        clearTimeout(landing);
        prerolling = false;
        el.pause();
        el.currentTime = 0;
        return false;
      }
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
      // The events that count as a gesture for sound: a mouse press, a finger lifted (not put
      // down: Safari only lets a touch play on release), a key.
      const events = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
      let waiting = false;
      const listen = (on: boolean) => {
        waiting = on;
        for (const type of events) {
          if (on) window.addEventListener(type, onGesture, { capture: true, passive: true });
          else window.removeEventListener(type, onGesture, true);
        }
      };
      function onGesture(event: Event) {
        if (!waiting) return;
        if (event instanceof PointerEvent && (event.type === 'pointerdown') !== (event.pointerType === 'mouse')) return;
        listen(false);
        // A press on the island's own play button is the visitor choosing: it starts the song itself.
        if (skip(event.target)) return;
        // A touch that ended a scroll doesn't count in some browsers: wait for the next one.
        void start().then((ok) => { if (!ok && el.paused) listen(true); });
      }
      listen(true);
      // Without a gesture yet, try anyway: browsers that allow it (a returning visitor in Chrome)
      // start now; the others leave the context suspended, and the first gesture does it.
      const probe = new AudioContext();
      const allowed = probe.state === 'running';
      void probe.close();
      if (allowed) { listen(false); void start().then((ok) => { if (!ok && el.paused) listen(true); }); }
      return () => listen(false);
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!frame) frame = requestAnimationFrame(tick);
      return () => {
        listeners.delete(listener);
      };
    },
    get prerolling() {
      return prerolling;
    },
  };
  return audio;
};
