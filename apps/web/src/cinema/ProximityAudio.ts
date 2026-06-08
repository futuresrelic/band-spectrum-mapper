/**
 * ProximityAudio — manages a single hidden YouTube IFrame player for Cinema Mode.
 *
 * Usage:
 *   const pa = new ProximityAudio();
 *   pa.init();                              // loads YT IFrame API, must be after user gesture
 *   pa.update('dQw4w9WgXcQ', 0.72);        // videoId + volume 0–1
 *   pa.dispose();                           // on unmount
 *
 * Only one video plays at a time. Switching videoId loads a new clip at a
 * random start position (within the first half of the video). Volume is set
 * via YT.Player.setVolume() every update call.
 */

declare global {
  interface Window {
    YT: {
      Player: new (el: string | HTMLElement, opts: object) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds: number }): void;
  setVolume(v: number): void;
  pauseVideo(): void;
  getPlayerState(): number;
  destroy(): void;
}

function extractVideoId(url: string): string | null {
  return url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;
}

export class ProximityAudio {
  private player: YTPlayer | null = null;
  private container: HTMLDivElement | null = null;
  private currentVideoId: string | null = null;
  private ready = false;
  private pendingVideoId: string | null = null;
  private pendingVolume = 0;

  /** Load the YT IFrame API and create the hidden player container. */
  init(): void {
    if (this.container) return; // already initialised

    // Create an off-screen container
    this.container = document.createElement('div');
    this.container.id = `yt-prox-${Date.now()}`;
    this.container.style.cssText = 'position:fixed;bottom:-9999px;left:-9999px;width:1px;height:1px;';
    document.body.appendChild(this.container);

    const createPlayer = () => {
      if (!this.container) return;
      this.player = new window.YT.Player(this.container, {
        width: 1, height: 1,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1 },
        events: {
          onReady: () => {
            this.ready = true;
            if (this.pendingVideoId) {
              this._loadVideo(this.pendingVideoId, this.pendingVolume);
              this.pendingVideoId = null;
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      // Load the IFrame API script once
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = createPlayer;
    }
  }

  /** Call every RAF frame with the nearest song's videoId (or null) and a volume 0–1. */
  update(youtubeUrl: string | null, volume: number): void {
    const videoId = youtubeUrl ? extractVideoId(youtubeUrl) : null;

    if (!this.ready || !this.player) {
      // Player not ready yet — queue it
      this.pendingVideoId = videoId;
      this.pendingVolume = Math.round(volume * 100);
      return;
    }

    if (videoId && videoId !== this.currentVideoId) {
      this._loadVideo(videoId, volume);
    } else if (this.player && this.currentVideoId) {
      this.player.setVolume(Math.round(volume * 100));
      // If volume dropped to near-zero, pause to save bandwidth
      if (volume < 0.02 && this.player.getPlayerState() === 1) {
        this.player.pauseVideo();
      }
    }
  }

  private _loadVideo(videoId: string, volume: number): void {
    this.currentVideoId = videoId;
    // Start at a random point in the first 2 minutes of the song
    const startSeconds = Math.floor(Math.random() * 120);
    this.player!.loadVideoById({ videoId, startSeconds });
    this.player!.setVolume(Math.round(volume * 100));
  }

  /** Stop playback and clean up. */
  dispose(): void {
    try { this.player?.pauseVideo(); } catch { /* ignore */ }
    try { this.player?.destroy(); } catch { /* ignore */ }
    this.player = null;
    this.container?.remove();
    this.container = null;
    this.ready = false;
    this.currentVideoId = null;
  }
}
