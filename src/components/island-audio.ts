/**
 * The island's sound. The song plays through the plain <audio> element and nothing else: routing
 * it through Web Audio (for a live analyser and fades) is what glitched on pause and resume, and a
 * suspended AudioContext never answers resume() without a gesture, which hung the autostart. The
 * needle drop is recorded onto the start of the file (public/audio/README.md).
 *
 * The meter still shows the music's real spectrum: scripts/audio-levels.mjs measures the file once
 * (six bands, 30 frames a second, a byte each) and the page reads the frame for the element's
 * current time, so the bars are in step with what is heard, whatever paused or sought it.
 *
 * Browsers only let a page make sound after a user gesture (Safari on iPhone always; desktop
 * browsers unless the visitor has allowed or played media on the site before). `autostart` tries
 * at once and otherwise on every tap, click and key until the song really plays: play() refused
 * outside a gesture simply rejects, so the events of a tap that don't count go by harmlessly.
 */

/** In step with scripts/audio-levels.mjs. */
const fps = 30;
const bands = 6;

export interface IslandAudio {
  /** Play or pause. Returns whether it is now meant to play. */
  toggle(): boolean;
  /** Tries to start now and otherwise on the first gesture that counts. Returns a function that stops waiting. */
  autostart(options: { skip: (target: EventTarget | null) => boolean }): () => void;
  /** The six levels, 0 to 1, every frame while the song plays (and as they settle after it stops). */
  subscribe(listener: (levels: readonly number[]) => void): () => void;
}

export const createIslandAudio = (el: HTMLAudioElement, levelsUrl: string): IslandAudio => {
  let measured: Uint8Array | null = null;
  void fetch(levelsUrl)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
    .then((buffer) => { measured = new Uint8Array(buffer); wake(); })
    .catch(() => undefined); // without it the bars rest; the song still plays

  const listeners = new Set<(levels: readonly number[]) => void>();
  const levels = Array.from({ length: bands }, () => 0);
  let frame = 0;

  const tick = () => {
    const at = measured && !el.paused ? Math.min(measured.length / bands - 1, Math.max(0, Math.floor(el.currentTime * fps))) : -1;
    for (let b = 0; b < bands; b++) {
      const target = at >= 0 && measured ? measured[at * bands + b] / 255 : 0;
      // Quick to rise, slower to fall, as a meter's needle does.
      levels[b] += (target - levels[b]) * (target > levels[b] ? 0.55 : 0.18);
    }
    for (const listener of listeners) listener(levels);
    // Paused and settled: stop until the song plays again.
    const idle = el.paused && levels.every((l) => l < 0.002);
    frame = listeners.size > 0 && !idle ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (!frame && listeners.size > 0) frame = requestAnimationFrame(tick);
  };
  el.addEventListener('playing', wake);

  return {
    toggle() {
      if (el.paused) {
        if (el.ended) el.currentTime = 0;
        void el.play().catch(() => undefined);
        return true;
      }
      el.pause();
      return false;
    },
    autostart({ skip }) {
      const events = ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const;
      const listen = (on: boolean) => {
        for (const type of events) {
          if (on) window.addEventListener(type, onGesture, { capture: true, passive: true });
          else window.removeEventListener(type, onGesture, true);
        }
      };
      const attempt = () => {
        if (!el.paused) { listen(false); return; }
        void el.play().then(() => listen(false), () => undefined);
      };
      function onGesture(event: Event) {
        // A press on the island's own play button is the visitor choosing: it starts the song itself.
        if (skip(event.target)) { listen(false); return; }
        attempt();
      }
      listen(true);
      // A browser that allows sound without a gesture starts now; elsewhere this rejects.
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
};
