/**
 * User Visual Presets for Cinema Mode.
 *
 * Stored in localStorage. Built-in CinemaThemes are separate (read-only).
 * A UserPreset builds on a base theme and adds overrides + sky sphere + artist profiles.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkyBackground {
  mode: 'solid' | 'skySphere';
  imageDataUrl: string;    // base64 data URL or ''
  rotX: number;            // radians per animation frame
  rotY: number;
  rotZ: number;
  brightness: number;      // CSS filter: 1 = normal
  contrast: number;
  saturation: number;
  hueShift: number;        // degrees 0–360
  blur: number;            // pixels 0–20
  opacity: number;         // 0–1
}

export interface ArtistColorProfile {
  primary: string;         // hex colour for nodes from this band
  glow: string;            // hex colour for future glow effects
}

export interface UserPreset {
  id: string;
  name: string;
  /** Which built-in CinemaTheme to inherit from. */
  baseThemeId: string;
  /** Per node-type colour overrides.  Empty string = use base theme colour. */
  nodeColorOverrides: Record<string, string>;
  /** Link colour override.  '' = use base theme. */
  linkColorOverride: string;
  background: SkyBackground;
  artistProfiles: {
    enabled: boolean;
    /** bandId → profile */
    profiles: Record<string, ArtistColorProfile>;
  };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SKY: SkyBackground = {
  mode: 'solid',
  imageDataUrl: '',
  rotX: 0,
  rotY: 0.0002,
  rotZ: 0,
  brightness: 0.45,
  contrast: 1.0,
  saturation: 0.9,
  hueShift: 0,
  blur: 8,
  opacity: 0.65,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeUserPreset(name: string, baseThemeId = 'default'): UserPreset {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    baseThemeId,
    nodeColorOverrides: {},
    linkColorOverride: '',
    background: { ...DEFAULT_SKY },
    artistProfiles: { enabled: false, profiles: {} },
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'cinema-user-presets-v1';

export function loadUserPresets(): UserPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserPreset[];
    // Backfill missing fields from older saves
    return parsed.map(p => ({
      ...makeUserPreset(p.name, p.baseThemeId),
      ...p,
      background: { ...DEFAULT_SKY, ...p.background },
    }));
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: UserPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // localStorage full — silently ignore (rare)
  }
}

// ---------------------------------------------------------------------------
// Image processing helpers
// ---------------------------------------------------------------------------

/**
 * Load an image File, resize to max 2048 px on the longest side (to stay
 * well under the 5 MB localStorage limit), and return a data URL.
 */
export function processImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 2048;
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Apply brightness/contrast/saturation/hueShift/blur to an image data URL
 * via an HTML canvas, returning a THREE.CanvasTexture-ready canvas element.
 */
export function applyImageFilters(
  imageDataUrl: string,
  opts: Pick<SkyBackground, 'brightness' | 'contrast' | 'saturation' | 'hueShift' | 'blur'>,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      // Apply blur separately (blur needs a slightly different approach to avoid edge fade)
      if (opts.blur > 0) {
        // Expand canvas so blur edges don't fade to transparent
        const b = Math.ceil(opts.blur * 2);
        canvas.width  = img.naturalWidth  + b * 2;
        canvas.height = img.naturalHeight + b * 2;
        ctx.filter = `brightness(${opts.brightness}) contrast(${opts.contrast}) saturate(${opts.saturation}) hue-rotate(${opts.hueShift}deg) blur(${opts.blur}px)`;
        ctx.drawImage(img, b, b, img.naturalWidth, img.naturalHeight);
        // Crop back to original size
        const cropped = document.createElement('canvas');
        cropped.width  = img.naturalWidth;
        cropped.height = img.naturalHeight;
        const cx = cropped.getContext('2d')!;
        cx.drawImage(canvas, -b, -b);
        resolve(cropped);
      } else {
        ctx.filter = `brightness(${opts.brightness}) contrast(${opts.contrast}) saturate(${opts.saturation}) hue-rotate(${opts.hueShift}deg)`;
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      }
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}
