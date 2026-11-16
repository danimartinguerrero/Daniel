/**
 * The island's sound. The song plays through a plain audio element and nothing else: routing it
 * through Web Audio (for a live analyser and fades) is what glitched on pause and resume, and a
 * suspended AudioContext never answers resume() without a gesture, which hung the autostart. The
 * needle drop is recorded onto the start of the file (public/audio/README.md).
 *
 * There is one audio element for the whole visit, made here and never put in the page. The site
 * moves between its pages with Astro's client router (the document stays, only the page in it
 * changes), and an element of its own, outside any page's DOM and any component's lifetime, is
 * what lets the song play on through every change of page, uninterrupted: nothing a page or the
 * island does to its own nodes can pause it, reload it or make another one.
 *
 * The meter still shows the music's real spectrum: scripts/audio-levels.mjs measures the file once
 * (six bands, 30 frames a second, a byte each) and the page reads the frame for the element's
 * current time, so the bars are in step with what is heard, whatever paused or sought it.
 *
 * Browsers only let a page make sound after a user gesture (Safari on iPhone always; desktop
 * browsers unless the visitor has allowed or played media on the site before). The autostart tries
 * at once and otherwise on every tap, click and key until the song really plays: play() refused
 * outside a gesture simply rejects, so the events of a tap that don't count go by harmlessly. A
 * visitor who pauses it is not played at again for the rest of the visit, reloads included.
 *
 * A reload, or a visit that leaves the site and comes back, is a new start for the element: the song
 * carries on from where it was, on the first gesture again (the browser asks for one).
 */

/** In step with scripts/audio-levels.mjs. */
const fps = 30;
const bands = 6;

/** sessionStorage: "paused" once the visitor has paused the song, "on" once they have played it. */
const choiceKey = 'island-music';
/** sessionStorage: where the song was when the page was last left, in seconds. */
const placeKey = 'island-music-at';

export interface IslandAudio {
  /** The one audio element. */
  readonly element: HTMLAudioElement;
  /** Play or pause, as the visitor's choice (it is remembered). Returns whether it is now meant to play. */
  toggle(): boolean;
  /** Jump to a place in the song, in seconds. */
  seek(seconds: number): void;
  /** The six levels, 0 to 1, every frame while the song plays (and as they settle after it stops). */
  subscribe(listener: (levels: readonly number[]) => void): () => void;
}

interface Song {
  src: string;
  /** The measured spectrum (see above). */
  levels: string;
  /** In seconds, for seeking before the file has said how long it is. */
  duration: number;
  /** A press the autostart leaves alone, because it starts or stops the song itself (the island's play button). */
  skip: (target: EventTarget | null) => boolean;
}

const read = (key: string) => {
  try { return sessionStorage.getItem(key); } catch { return null; } // storage blocked
};
const write = (key: string, value: string) => {
  try { sessionStorage.setItem(key, value); } catch { /* storage blocked */ }
};

let shared: IslandAudio | null = null;

/** The song, made on first use and the same one after that, for as long as the document lives. */
export const islandAudio = (song: Song): IslandAudio => (shared ??= create(song));

const create = (song: Song): IslandAudio => {
  const el = new Audio();
  el.preload = 'auto';
  el.src = song.src;

  let measured: Uint8Array | null = null;
  void fetch(song.levels)
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
  // At the end, back to the top, paused, ready to play again.
  el.addEventListener('ended', () => { el.currentTime = 0; });

  // Carry on from where the song was when the page was last left (a reload, or a visit back from
  // another site). Set once the file has said how long it is: before that, Safari, which doesn't
  // preload on phones, drops it.
  const place = Number(read(placeKey));
  if (place > 0) {
    const restore = () => { if (place < el.duration) el.currentTime = place; };
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) restore();
    else el.addEventListener('loadedmetadata', restore, { once: true });
  }
  addEventListener('pagehide', () => write(placeKey, String(el.currentTime)));

  // The autostart: at once where the browser allows it, otherwise on the first gesture that counts.
  const gestures = ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const;
  let waiting = false;
  const listen = (on: boolean) => {
    if (on === waiting) return;
    waiting = on;
    for (const type of gestures) {
      if (on) addEventListener(type, onGesture, { capture: true, passive: true });
      else removeEventListener(type, onGesture, true);
    }
  };
  const attempt = () => {
    if (!el.paused) { listen(false); return; }
    void el.play().then(() => listen(false), () => undefined);
  };
  function onGesture(event: Event) {
    // A press on the island's own play button is the visitor choosing: it starts the song itself.
    if (song.skip(event.target)) { listen(false); return; }
    attempt();
  }
  const autostart = () => {
    if (read(choiceKey) === 'paused' || !el.paused) return;
    listen(true);
    // A browser that allows sound without a gesture starts now; elsewhere this rejects.
    attempt();
  };
  autostart();
  // Back from another site through the back/forward cache: the page is the one that was left, but
  // the browser paused the song on the way out. Wait for a gesture again, as a fresh load does.
  addEventListener('pageshow', (event) => { if (event.persisted) autostart(); });

  return {
    element: el,
    toggle() {
      listen(false);
      let playing: boolean;
      if (el.paused) {
        if (el.ended) el.currentTime = 0;
        void el.play().catch(() => undefined);
        playing = true;
      } else {
        el.pause();
        playing = false;
      }
      write(choiceKey, playing ? 'on' : 'paused');
      return playing;
    },
    seek(seconds) {
      const length = Number.isFinite(el.duration) ? el.duration : song.duration;
      el.currentTime = Math.min(length, Math.max(0, seconds));
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
