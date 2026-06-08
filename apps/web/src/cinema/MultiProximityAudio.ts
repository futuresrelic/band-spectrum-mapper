/**
 * MultiProximityAudio — manages a pool of hidden YouTube IFrame players for
 * Cinema Mode spatial audio mixing.
 *
 * Up to MAX_PLAYERS songs can play simultaneously. Volume for each is set
 * every animation frame based on distance. Tracks fade in/out smoothly so
 * flying through the graph produces a continuous spatial audio mix rather
 * than abrupt switches.
 *
 * Usage:
 *   const audio = new MultiProximityAudio();
 *   audio.init();                                   // call on user gesture
 *   audio.update(new Map([['vid123', 0.8], ...]));  // every RAF frame
 *   audio.dispose();                                // on unmount
 */

// YT IFrame API types — mirrors the declaration in ProximityAudio.ts.
// We avoid re-declaring window globals here to prevent TypeScript merge conflicts.
interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds: number }): void;
  setVolume(v: number): void;
  pauseVideo(): void;
  playVideo(): void;
  getPlayerState(): number;
  destroy(): void;
}

// Typed accessor so we don't re-declare window.YT globally
const ytWindow = window as unknown as {
  YT?: { Player: new (el: string | HTMLElement, opts: object) => YTPlayer };
  onYouTubeIframeAPIReady?: () => void;
};

const MAX_PLAYERS = 3;
const FADE_STEP   = 3;   // volume units per frame (0-100 scale); ~0.55 s for full fade at 60fps
const FREE_BELOW  = 8;   // slot considered free when currentVol drops below this

// ---------------------------------------------------------------------------
// Static YT API loader — shared across all instances
// ---------------------------------------------------------------------------

type ApiState = 'unloaded' | 'loading' | 'ready';
const _api = {
  state: 'unloaded' as ApiState,
  callbacks: [] as Array<() => void>,

  ensure(cb: () => void) {
    if (this.state === 'ready' || ytWindow.YT?.Player) { this.state = 'ready'; cb(); return; }
    this.callbacks.push(cb);
    if (this.state === 'loading') return;
    this.state = 'loading';
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const prev = ytWindow.onYouTubeIframeAPIReady;
    ytWindow.onYouTubeIframeAPIReady = () => {
      prev?.();
      this.state = 'ready';
      this.callbacks.forEach(fn => fn());
      this.callbacks = [];
    };
  },
};

// ---------------------------------------------------------------------------
// PlayerSlot
// ---------------------------------------------------------------------------

interface Slot {
  player:     YTPlayer | null;
  container:  HTMLDivElement;
  videoId:    string | null;
  currentVol: number;   // 0–100 actual applied volume
  targetVol:  number;   // 0–100 desired volume
  ready:      boolean;
  pendingId:  string | null; // videoId to load once player is ready
}

export class MultiProximityAudio {
  private slots: Slot[] = [];

  private makeSlot(): Slot {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:1px;height:1px;pointer-events:none;';
    document.body.appendChild(container);

    const slot: Slot = {
      player: null, container, videoId: null,
      currentVol: 0, targetVol: 0, ready: false, pendingId: null,
    };
    this.slots.push(slot);

    _api.ensure(() => {
      if (!slot.container.isConnected) return; // disposed before API was ready
      slot.player = new ytWindow.YT!.Player(container, {
        width: 1, height: 1,
        playerVars: {
          autoplay: 0, controls: 0, disablekb: 1,
          fs: 0, iv_load_policy: 3, modestbranding: 1,
        },
        events: {
          onReady: () => {
            slot.ready = true;
            slot.player!.setVolume(0);
            if (slot.pendingId) {
              const startSeconds = Math.floor(Math.random() * 120);
              slot.player!.loadVideoById({ videoId: slot.pendingId, startSeconds });
              slot.videoId  = slot.pendingId;
              slot.pendingId = null;
            }
          },
        },
      });
    });

    return slot;
  }

  /** Call on user gesture — pre-creates all player slots so loadVideoById autoplays. */
  init(): void {
    while (this.slots.length < MAX_PLAYERS) this.makeSlot();
  }

  /**
   * Call every animation frame.
   * entries: Map<videoId, volume0to1>
   * Returns videoIds currently audible (currentVol > FREE_BELOW).
   */
  update(entries: Map<string, number>): string[] {
    // 1. Drop target to 0 for songs no longer in range
    for (const slot of this.slots) {
      if (slot.videoId && !entries.has(slot.videoId)) {
        slot.targetVol = 0;
      }
    }

    // 2. Assign / update slots for wanted songs
    entries.forEach((vol, videoId) => {
      const target = Math.round(Math.max(0, Math.min(1, vol)) * 100);

      // Already playing this song?
      const existing = this.slots.find(s => s.videoId === videoId || s.pendingId === videoId);
      if (existing) { existing.targetVol = target; return; }

      // Find a free or nearly-free slot
      const freeSlot =
        this.slots.find(s => !s.videoId && s.currentVol < FREE_BELOW) ??
        this.slots.find(s => s.targetVol === 0 && s.currentVol < FREE_BELOW);
      if (!freeSlot) return; // all slots busy — song will get picked up as others fade out

      freeSlot.targetVol = target;
      if (freeSlot.ready && freeSlot.player) {
        freeSlot.videoId   = videoId;
        freeSlot.pendingId = null;
        freeSlot.player.setVolume(0);
        freeSlot.currentVol = 0;
        const startSeconds = Math.floor(Math.random() * 120);
        freeSlot.player.loadVideoById({ videoId, startSeconds });
      } else {
        freeSlot.pendingId = videoId;
        freeSlot.videoId   = null;
      }
    });

    // 3. Lerp volumes and manage play/pause
    const active: string[] = [];
    for (const slot of this.slots) {
      if (!slot.ready || !slot.player) continue;

      const diff = slot.targetVol - slot.currentVol;
      if (Math.abs(diff) <= FADE_STEP) {
        slot.currentVol = slot.targetVol;
      } else {
        slot.currentVol += Math.sign(diff) * FADE_STEP;
      }

      const vol = Math.round(slot.currentVol);
      slot.player.setVolume(vol);

      // Pause to save bandwidth when silent; resume when volume rises
      const state = slot.player.getPlayerState();
      if (vol < 2 && state === 1 /* PLAYING */) {
        slot.player.pauseVideo();
      } else if (vol >= 2 && state === 2 /* PAUSED */) {
        slot.player.playVideo();
      }

      // Release slot when fully faded out
      if (slot.currentVol === 0 && slot.targetVol === 0) {
        slot.videoId = null;
      }

      if (slot.currentVol > FREE_BELOW && slot.videoId) {
        active.push(slot.videoId);
      }
    }

    return active;
  }

  /** Stop everything and remove DOM elements. */
  dispose(): void {
    for (const slot of this.slots) {
      try { slot.player?.pauseVideo(); } catch { /* ignore */ }
      try { slot.player?.destroy();    } catch { /* ignore */ }
      slot.container.remove();
    }
    this.slots = [];
  }
}
